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

export async function refreshReservationProgramSnapshots(supabase, reservationNo, reservation, packages = []) {
  if (!reservationNo || !reservation?.package_name) return { ok: true, skipped: true }
  if (reservation.settlement_snapshot_locked || reservation.settle_status === 'settled') {
    return { ok: true, skipped: true }
  }

  const basisDate =
    reservation.price_basis_date ||
    String(reservation.booking_created_at || '').slice(0, 10) ||
    todayDate()

  let pkg = packages.find(p => p.name === reservation.package_name)
  if (!pkg?.package_programs) {
    const { data, error } = await supabase
      .from('packages')
      .select('*, package_programs(*, vendors(key,name,color))')
      .eq('name', reservation.package_name)
      .maybeSingle()
    if (error) return { ok: false, error }
    pkg = data
  }

  const packagePrograms = (pkg?.package_programs || []).filter(p => !p.is_deleted)
  if (!packagePrograms.length) return { ok: true, skipped: true }

  const vendorKeys = [...new Set(packagePrograms.map(p => p.vendor_key).filter(Boolean))]
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
  const pax = Number(reservation.pax) || 0

  const rows = packagePrograms.map(pp => {
    const vendor = vendors.find(v => v.key === pp.vendor_key)
    const currentProgram = (vendor?.vendor_programs || []).find(p => p.prog_name === pp.prog_name && !p.is_deleted)
    const history = pickPriceHistory(histories, pp.vendor_key, pp.prog_name, basisDate)
    const settleType = history?.settle_type || currentProgram?.settle_type || 'per_person'
    const customerPrice = Number(history?.customer_price ?? currentProgram?.customer_price ?? 0) || 0
    const vendorSettlePrice = Number(history?.vendor_settle_price ?? currentProgram?.vendor_settle_price ?? currentProgram?.unit_price ?? 0) || 0

    return {
      reservation_no: reservationNo,
      package_id: pkg?.id ? String(pkg.id) : null,
      package_name: reservation.package_name,
      vendor_program_id: currentProgram?.id ? String(currentProgram.id) : null,
      vendor_key: pp.vendor_key,
      vendor_name: vendor?.name || pp.vendors?.name || null,
      prog_name: pp.prog_name,
      pax,
      customer_price: customerPrice,
      vendor_settle_price: vendorSettlePrice,
      settle_type: settleType,
      customer_total: lineTotal(customerPrice, settleType, pax),
      vendor_settle_total: lineTotal(vendorSettlePrice, settleType, pax),
      price_basis_date: basisDate,
      price_effective_from: history?.effective_from || null,
      price_effective_to: history?.effective_to || null,
      source_price_history_id: history?.id || null,
      snapshot_memo: history ? null : 'current master price fallback',
    }
  })

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

  const experienceSalesAmount = rows.reduce((sum, row) => sum + (Number(row.customer_total) || 0), 0)
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
