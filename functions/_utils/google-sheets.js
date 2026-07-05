export async function getGoogleAuthToken(env) {
  const parsedKey = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}')
  const privateKey = parsedKey.private_key || parsedKey.privateKey
  if (!privateKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured')

  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const claim = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  const enc = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const payload = `${enc(header)}.${enc(claim)}`

  const keyData = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
    .trim()

  const binaryDer = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(payload)
  )

  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${payload}.${signature}`

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(jwt)}`,
  })

  const data = await resp.json()
  if (!data.access_token) throw new Error(`Failed to get token: ${JSON.stringify(data)}`)
  return data.access_token
}

export async function getSheet(token, sheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!resp.ok) throw new Error(`Failed to read sheet: ${await resp.text()}`)
  return resp.json()
}

export async function appendSheet(token, sheetId, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  })
  if (!resp.ok) throw new Error(`Failed to append sheet: ${await resp.text()}`)
  return resp.json()
}

export async function updateSheet(token, sheetId, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`
  const rows = Array.isArray(values[0]) ? values : [values]
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: rows }),
  })
  if (!resp.ok) throw new Error(`Failed to update sheet: ${await resp.text()}`)
  return resp.json()
}

export const SHEET_NAMES = ['MIS', 'MTs', 'PAUD']

export const MONTH_HEADERS = [
  'Jul 2026','Aug 2026','Sep 2026','Oct 2026','Nov 2026','Dec 2026',
  'Jan 2027','Feb 2027','Mar 2027','Apr 2027','May 2027','Jun 2027',
]

export function getMonthIdx(bulan, tahun) {
  return (tahun - 2026) * 12 + (bulan - 7)
}

export async function getSheetId(token, sheetId, sheetName) {
  const info = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })).json()
  const s = (info.sheets || []).find(s => s.properties.title === sheetName)
  return s ? s.properties.sheetId : null
}

export async function createSheet(token, sheetId, title) {
  const info = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })).json()
  if ((info.sheets || []).some(s => s.properties.title === title)) return { alreadyExists: true }
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  })
  if (!resp.ok) throw new Error(`Failed to create sheet: ${await resp.text()}`)
  return resp.json()
}

export async function deleteSheetRow(token, sheetId, sheetName, rowIndex) {
  const info = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })).json()
  const s = (info.sheets || []).find(sh => sh.properties.title === sheetName)
  if (!s) throw new Error(`Sheet "${sheetName}" not found`)
  const gid = s.properties.sheetId
  const requests = [{
    deleteDimension: {
      range: {
        sheetId: gid,
        dimension: 'ROWS',
        startIndex: rowIndex,
        endIndex: rowIndex + 1,
      },
    },
  }]
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  })
  if (!resp.ok) throw new Error(`Failed to delete row: ${await resp.text()}`)
  return resp.json()
}

export async function deleteSheetTab(token, sheetId, sheetName) {
  const info = await (await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`, {
    headers: { Authorization: `Bearer ${token}` }
  })).json()
  const s = (info.sheets || []).find(sh => sh.properties.title === sheetName)
  if (!s) return { notFound: true }
  const gid = s.properties.sheetId
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`
  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: gid } }] }),
  })
  if (!resp.ok) throw new Error(`Failed to delete sheet tab: ${await resp.text()}`)
  return resp.json()
}
