const BASE = '/api'

async function getJSON(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json()
}

export const fetchAttractions = () => getJSON('/attractions')
export const fetchRoutes = () => getJSON('/routes')
export const fetchWeather = () => getJSON('/weather')
