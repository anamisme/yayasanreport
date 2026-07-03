import { getGoogleAuthToken, getSheet } from '../_utils/google-sheets.js'

function parseSiswa(rows) {
  if (!rows || rows.length < 2) return []
  return rows.slice(1).map((row, i) => ({
    id: parseInt(row[0]) || i + 1,
    nama: row[1] || '',
    lembaga: row[2] || '',
    kelas: row[3] || '',
    tarifInfaq: parseInt(row[4]) || 0,
  })).filter((s) => s.nama)
}

function parsePembayaran(rows) {
  if (!rows || rows.length < 2) return []
  return rows.slice(1).map((row, i) => ({
    id: parseInt(row[0]) || i + 1,
    siswaId: parseInt(row[1]) || 0,
    bulan: parseInt(row[2]) || 0,
    tahun: parseInt(row[3]) || 0,
    jumlah: parseInt(row[4]) || 0,
    kategori: row[5] || 'Infaq',
    lembaga: row[7] || '',
  }))
}

export async function onRequest(context) {
  const { request, env } = context
  const url = new URL(request.url)
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  try {
    const token = await getGoogleAuthToken(env)
    const sheetId = env.GOOGLE_SHEET_ID

    const lembaga = url.searchParams.get('lembaga')
    const tahun = parseInt(url.searchParams.get('tahun')) || new Date().getFullYear()
    const bulanParam = url.searchParams.get('bulan')

    const [siswaData, bayarData] = await Promise.all([
      getSheet(token, sheetId, 'Siswa!A:E'),
      getSheet(token, sheetId, 'Pembayaran!A:I'),
    ])

    let siswa = parseSiswa(siswaData.values || [])
    let payments = parsePembayaran(bayarData.values || [])

    if (lembaga) {
      siswa = siswa.filter((s) => s.lembaga === lembaga)
      payments = payments.filter((p) => p.lembaga === lembaga)
    }

    payments = payments.filter((p) => p.tahun === tahun)
    if (bulanParam) {
      payments = payments.filter((p) => p.bulan === parseInt(bulanParam))
    }

    const bulanNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ]

    const monthlyStats = bulanNames.map((name, idx) => {
      const bulan = idx + 1
      const paidSiswa = new Set(
        payments.filter((p) => p.bulan === bulan).map((p) => p.siswaId)
      )
      const totalSiswa = siswa.length
      const paidCount = paidSiswa.size
      const totalBayar = payments
        .filter((p) => p.bulan === bulan)
        .reduce((sum, p) => sum + p.jumlah, 0)

      return {
        bulan,
        bulanNama: name,
        totalSiswa,
        paidCount,
        unpaidCount: totalSiswa - paidCount,
        percentage: totalSiswa > 0 ? Math.round((paidCount / totalSiswa) * 100) : 0,
        totalBayar,
      }
    })

    const totalPemasukan = monthlyStats.reduce((sum, m) => sum + m.totalBayar, 0)

    return new Response(
      JSON.stringify({
        tahun,
        lembaga: lembaga || 'all',
        totalSiswa: siswa.length,
        totalPemasukan,
        monthly: monthlyStats,
      }),
      { headers }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers,
    })
  }
}
