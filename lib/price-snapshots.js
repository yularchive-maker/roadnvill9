function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function feeAmount(total, percent) {
  return Math.round((Number(total) || 0) * (Number(percent) || 0) / 100)
}

function lineTotal(price, settleType, pax) {
  const amount = Number(price) || 0
  return settleType === 'fixed' ? amount : amount * (Number(pax) || 0)
}

function pickPriceHistory(rows, vendorKey, progName, basisDate) {
  return (rows || [])
    .filter(row => row.vendor_key === vendorKey && row.prog_name === progName)
    .filter(row => row.effective_from <= basisDate)
    .filter(row => !row.effective_to || row.effective_to >= basisDate)
    .sort((a, b) => String(b.effective_from).localeCompare(String(a.effective_from)))[0]
}

function activeRows(rows) {
  return (rows || []).filter(row => row && row.is_deleted !== true)
}

function findPackage(packages, component, reservation) {
  const packageId = component?.package_id ? String(component.package_id) : ''
  const packageName = component?.package_name || reservation?.package_name || ''
  return (packages || []).find(pkg =>
    (packageId && String(pkg.id) === packageId) ||
    (packageName && pkg.name === packageName)
  )
}

function findVendorProgram(vendor, progName) {
  return (vendor?.vendor_programs || []).find(program =>
    program.prog_name === progName && program.is_deleted !== true
  )
}

export async function refreshReservationProgramSnapshots(supabase, reservationNo, reservation, packages = []) {
  if (!reservationNo) return { ok: true, skipped: true }
  if (reservation.settlement_snapshot_locked || reservation.settle_status === 'settled') {
    return { ok: true, skipped: true }
  }

  const basisDate =
    reservation.price_basis_date ||
    String(reservation.booking_created_at || '').slice(0, 10) ||
    todayDate()

  const { data: componentData, error: componentError } = await supabase
    .from('reservation_budget_usages')
    .select('*')
    .eq('reservation_no', reservationNo)
    .eq('usage_type', 'product_operation')
    .or('is_deleted.is.null,is_deleted.eq.false')
  if (componentError) return { ok: false, error: componentError }

  const components = (componentData || []).filter(row =>
    Number(row.people_count) > 0 &&
    (row.package_id || row.package_name || row.vendor_key || row.prog_name)
  )

  if (!components.length && !reservation?.package_name) return { ok: true, skipped: true }

  let loadedPackages = packages || []
  const needsPackageLoad =
    components.some(component => (component.package_id || component.package_name) && !findPackage(loadedPackages, component, reservation)) ||
    (!components.length && reservation?.package_name && !findPackage(loadedPackages, null, reservation))

  if (needsPackageLoad) {
    const packageIds = [...new Set(components.map(row => row.package_id).filter(Boolean).map(String))]
    const packageNames = [...new Set([
      ...components.map(row => row.package_name).filter(Boolean),
      reservation?.package_name,
    ].filter(Boolean))]

    let packageRows = []
    if (packageIds.length) {
      const { data, error } = await supabase
        .from('packages')
        .select('*, package_programs(*, vendors(key,name,color))')
        .in('id', packageIds)
      if (error) return { ok: false, error }
      packageRows = [...packageRows, ...(data || [])]
    }
    if (packageNames.length) {
      const { data, error } = await supabase
        .from('packages')
        .select('*, package_programs(*, vendors(key,name,color))')
        .in('name', packageNames)
      if (error) return { ok: false, error }
      packageRows = [...packageRows, ...(data || [])]
    }

    const byId = new Map()
    for (const pkg of [...loadedPackages, ...packageRows]) {
      if (pkg?.id) byId.set(String(pkg.id), pkg)
    }
    loadedPackages = [...byId.values()]
  }

  const snapshotInputs = components.length
    ? components
    : [{
        package_id: null,
        package_name: reservation.package_name,
        people_count: Number(reservation.pax) || 0,
        customer_unit_price: Number(reservation.price) || 0,
        normal_unit_price: Number(reservation.price) || 0,
        sale_type: 'package',
      }]

  const vendorKeys = [...new Set(snapshotInputs.flatMap(component => {
    if ((component.sale_type || 'package') === 'single') return [component.vendor_key].filter(Boolean)
    const pkg = findPackage(loadedPackages, component, reservation)
    return activeRows(pkg?.package_programs).map(program => program.vendor_key).filter(Boolean)
  }))]

  if (!vendorKeys.length) return { ok: true, skipped: true }

  const [vendorRes, historyRes] = await Promise.all([
    supabase
      .from('vendors')
      .select('key,name,vendor_programs(*)')
      .in('key', vendorKeys),
    supabase
      .from('program_price_history')
      .select('*')
      .in('vendor_key', vendorKeys)
      .lte('effective_from', basisDate)
      .or(`effective_to.is.null,effective_to.gte.${basisDate}`)
      .or('is_deleted.is.null,is_deleted.eq.false'),
  ])
  if (vendorRes.error) return { ok: false, error: vendorRes.error }

  const histories = historyRes.error ? [] : (historyRes.data || [])
  const vendors = vendorRes.data || []

  const rows = []
  for (const component of snapshotInputs) {
    const pax = Number(component.people_count) || 0
    const customerUnit = Number(component.customer_unit_price ?? component.normal_unit_price) || 0

    if ((component.sale_type || 'package') === 'single') {
      const vendor = vendors.find(v => v.key === component.vendor_key)
      const currentProgram = findVendorProgram(vendor, component.prog_name)
      const history = pickPriceHistory(histories, component.vendor_key, component.prog_name, basisDate)
      const settleType = history?.settle_type || currentProgram?.settle_type || 'per_person'
      const vendorSettlePrice = Number(history?.vendor_settle_price ?? currentProgram?.vendor_settle_price ?? currentProgram?.unit_price ?? 0) || 0
      rows.push({
        reservation_no: reservationNo,
        package_id: null,
        package_name: component.package_name || component.item_name || 'single',
        vendor_program_id: currentProgram?.id ? String(currentProgram.id) : null,
        vendor_key: component.vendor_key,
        vendor_name: vendor?.name || null,
        prog_name: component.prog_name,
        pax,
        customer_price: customerUnit,
        vendor_settle_price: vendorSettlePrice,
        settle_type: settleType,
        customer_total: lineTotal(customerUnit, settleType, pax),
        vendor_settle_total: lineTotal(vendorSettlePrice, settleType, pax),
        price_basis_date: basisDate,
        price_effective_from: history?.effective_from || null,
        price_effective_to: history?.effective_to || null,
        source_price_history_id: history?.id || null,
        snapshot_memo: history ? null : 'component single snapshot',
      })
      continue
    }

    const pkg = findPackage(loadedPackages, component, reservation)
    const packagePrograms = activeRows(pkg?.package_programs)
    for (const pp of packagePrograms) {
      const vendor = vendors.find(v => v.key === pp.vendor_key)
      const currentProgram = findVendorProgram(vendor, pp.prog_name)
      const history = pickPriceHistory(histories, pp.vendor_key, pp.prog_name, basisDate)
      const settleType = pp.settle_type || history?.settle_type || currentProgram?.settle_type || 'per_person'
      const vendorSettlePrice = Number(pp.vendor_settle_price ?? history?.vendor_settle_price ?? currentProgram?.vendor_settle_price ?? currentProgram?.unit_price ?? 0) || 0
      rows.push({
        reservation_no: reservationNo,
        package_id: pkg?.id ? String(pkg.id) : (component.package_id ? String(component.package_id) : null),
        package_name: component.package_name || pkg?.name || reservation.package_name,
        vendor_program_id: currentProgram?.id ? String(currentProgram.id) : null,
        vendor_key: pp.vendor_key,
        vendor_name: vendor?.name || pp.vendors?.name || null,
        prog_name: pp.prog_name,
        pax,
        customer_price: customerUnit,
        vendor_settle_price: vendorSettlePrice,
        settle_type: settleType,
        customer_total: 0,
        vendor_settle_total: lineTotal(vendorSettlePrice, settleType, pax),
        price_basis_date: basisDate,
        price_effective_from: history?.effective_from || null,
        price_effective_to: history?.effective_to || null,
        source_price_history_id: history?.id || null,
        snapshot_memo: pp.vendor_settle_price ? 'package program price' : history ? null : 'current master price fallback',
      })
    }
  }

  if (!rows.length) return { ok: true, skipped: true }

  const { error: deleteError } = await supabase
    .from('reservation_program_snapshots')
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq('reservation_no', reservationNo)
    .or('is_deleted.is.null,is_deleted.eq.false')
  if (deleteError) return { ok: false, error: deleteError }

  const { error: insertError } = await supabase
    .from('reservation_program_snapshots')
    .insert(rows)
  if (insertError) return { ok: false, error: insertError }

  const experienceSalesAmount = components.length
    ? snapshotInputs.reduce((sum, component) => sum + ((Number(component.customer_unit_price ?? component.normal_unit_price) || 0) * (Number(component.people_count) || 0)), 0)
    : rows.reduce((sum, row) => sum + (Number(row.customer_total) || 0), 0)
  const { error: reservationError } = await supabase
    .from('reservations')
    .update({
      booking_created_at: reservation.booking_created_at || new Date().toISOString(),
      price_snapshot_at: new Date().toISOString(),
      price_basis_date: basisDate,
      experience_sales_amount: experienceSalesAmount,
      platform_fee_amount: feeAmount(experienceSalesAmount, reservation.plat_fee),
      agency_fee_amount: feeAmount(experienceSalesAmount, reservation.ag_fee),
    })
    .eq('no', reservationNo)
  if (reservationError) return { ok: false, error: reservationError }

  return { ok: true, rows }
}
