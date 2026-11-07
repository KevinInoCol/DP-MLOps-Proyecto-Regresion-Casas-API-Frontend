# Frontend – Predicción de Precios de Casas

Interfaz en React + Vite que consume el modelo de regresión desplegado en Cloud Run:

`POST https://servicio-api-proyecto-regresion-kevin-inofuente-967741749170.us-central1.run.app/obtener-datos-de-usuario-y-predecir`
(multipart/form-data, campo `file` con un CSV del formato de Kaggle House Prices `test.csv`).

## Ejecutar

```bash
npm install
npm run dev        # http://localhost:5173
```

## Cómo funciona

- **Proxy `/api`**: la API no envía cabeceras CORS, así que el navegador no puede llamarla
  directamente. En desarrollo, `vite.config.js` reenvía `/api/*` a Cloud Run; en Vercel lo hace `vercel.json`.
- **`src/api.js`**: envía el CSV (forzando `text/csv`, que la API exige).
- **`src/alinear.js`**: corrige un desalineamiento de la API. Cuando hay filas con nulos, la API
  hace `dropna()` y luego `pd.concat` por índice con una Serie indexada `0..n-1`, así que las
  predicciones quedan pegadas a casas equivocadas. El frontend reconstruye la correspondencia
  cruzando la respuesta con el CSV enviado y recupera el `Id` original.
- `public/ejemplo_casas.csv`: CSV de ejemplo (1459 casas).

## Arreglo recomendado en la API

En `prediccion_o_inferencia`, antes de devolver:

```python
datos_de_test = datos_de_test.reset_index(drop=True)
```
