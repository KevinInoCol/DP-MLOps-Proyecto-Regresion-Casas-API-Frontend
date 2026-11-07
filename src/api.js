// Cliente del endpoint de predicción.
// POST /obtener-datos-de-usuario-y-predecir  (multipart/form-data, campo "file")
// Responde con un CSV: columnas de entrada procesadas + Predicciones + Predicciones_Sin_Escalar

const ENDPOINT = '/api/obtener-datos-de-usuario-y-predecir'

export async function predecir(file) {
  // La API exige content_type == "text/csv". En Windows el navegador suele
  // marcar los .csv como "application/vnd.ms-excel", así que lo forzamos.
  const csv = new File([file], file.name, { type: 'text/csv' })
  const form = new FormData()
  form.append('file', csv)

  const res = await fetch(ENDPOINT, { method: 'POST', body: form })

  if (!res.ok) {
    let detalle = `Error ${res.status}`
    try {
      const data = await res.json()
      if (data?.detail) {
        detalle = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
      }
    } catch {
      /* respuesta no-JSON */
    }
    throw new Error(detalle)
  }

  const blob = await res.blob()
  const texto = await blob.text()
  return { blob, texto }
}

export async function healthcheck() {
  const res = await fetch('/api/')
  if (!res.ok) throw new Error(`Error ${res.status}`)
  return res.json()
}
