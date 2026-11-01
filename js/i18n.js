"use strict";
/* Interface translations. Spanish is the default unless the user saved English. */
const WeatherI18n = (() => {
  const english = {
    "Buscar una ciudad": "Search for a city",
    "Sugerencias de ciudades": "City suggestions",
    "Usar mi ubicación": "Use my location",
    "Mi ubicación": "My location",
    "Unidad de temperatura": "Temperature unit",
    "Paisaje y condiciones meteorológicas": "Landscape and weather conditions",
    "Conectando con el cielo…": "Connecting to the weather…",
    "Consultando el tiempo": "Loading weather",
    "Las condiciones aparecerán en unos segundos":
      "Conditions will appear in a few seconds",
    "Esperando las condiciones reales": "Waiting for weather conditions",
    "Máx. —": "High —",
    "Mín. —": "Low —",
    "Conectando con Open-Meteo": "Connecting to Open-Meteo",
    "Volver al tiempo actual": "Back to current weather",
    "Buscando las condiciones actuales…": "Loading current conditions…",
    "Las próximas 24 horas": "Next 24 hours",
    "Ver horas anteriores": "View earlier hours",
    "Ver horas siguientes": "View later hours",
    "La previsión horaria aparecerá aquí.":
      "The hourly forecast will appear here.",
    "Los próximos 7 días": "Next 7 days",
    "Máximas y mínimas": "Highs and lows",
    "Esperando la previsión de esta semana.":
      "Waiting for this week’s forecast.",
    "Selecciona un día para explorar su previsión.":
      "Select a day to explore its forecast.",
    "El tiempo, en detalle": "Weather details",
    Ahora: "Now",
    Amanecer: "Sunrise",
    Atardecer: "Sunset",
    "Datos meteorológicos de": "Weather data by",
    Idioma: "Language",
    Despejado: "Clear",
    "Mayormente despejado": "Mostly clear",
    "Parcialmente nublado": "Partly cloudy",
    "Cielo cubierto": "Overcast",
    Niebla: "Fog",
    Llovizna: "Drizzle",
    "Lluvia helada": "Freezing rain",
    "Lluvia intensa": "Heavy rain",
    Lluvia: "Rain",
    Nieve: "Snow",
    Chubascos: "Showers",
    "Chubascos de nieve": "Snow showers",
    Tormenta: "Thunderstorm",
    "Condición no disponible": "Condition unavailable",
    Reintentar: "Retry",
    "Actualizando las condiciones meteorológicas…":
      "Updating weather conditions…",
    "Actualizado a las {time} · Hora local de {city}":
      "Updated at {time} · Local time in {city}",
    "No se ha podido obtener el tiempo. Comprueba la conexión y vuelve a intentarlo.":
      "Unable to load the weather. Check your connection and try again.",
    "Sin conexión. Conéctate a internet para consultar el tiempo.":
      "You are offline. Connect to the internet to check the weather.",
    "No hay datos disponibles": "No data available",
    "Reintenta la consulta para ver las condiciones reales":
      "Retry to load the weather conditions",
    "Sin datos meteorológicos": "No weather data",
    "La conexión con Open-Meteo no está disponible":
      "The connection to Open-Meteo is unavailable",
    "Datos anteriores · sin actualizar": "Previous data · not updated",
    "Sensación térmica de {temperature}": "Feels like {temperature}",
    "máx.": "high",
    "mín.": "low",
    "Condiciones actuales": "Current conditions",
    Previsión: "Forecast",
    "{amount} mm de precipitación prevista":
      "{amount} mm of forecast precipitation",
    "Ver previsión: {time}, {temperature}, {condition}":
      "View forecast: {time}, {temperature}, {condition}",
    "Consultar {day}, máxima {high}, mínima {low}":
      "View {day}, high {high}, low {low}",
    Hoy: "Today",
    Humedad: "Humidity",
    "Humedad relativa": "Relative humidity",
    Viento: "Wind",
    "Dirección {direction}": "Direction {direction}",
    "Índice UV": "UV index",
    "Sin datos": "No data",
    "Exposición baja": "Low exposure",
    "Exposición moderada": "Moderate exposure",
    "Exposición alta": "High exposure",
    "Exposición muy alta": "Very high exposure",
    Precipitación: "Precipitation",
    "En esta hora": "This hour",
    Visibilidad: "Visibility",
    "Al nivel del suelo": "At ground level",
    "Prob. de lluvia": "Rain chance",
    "Buscando ciudades…": "Searching for cities…",
    "No se encontraron ciudades. Prueba otro nombre.":
      "No cities found. Try another name.",
    "No se pudo buscar. Comprueba tu conexión e inténtalo de nuevo.":
      "Search unavailable. Check your connection and try again.",
    "Mostrando {city}. Puedes buscar otra ciudad.":
      "Showing {city}. You can search for another city.",
    "Puedes buscar tu ciudad.": "You can search for your city.",
    "Este navegador no permite usar la ubicación.":
      "This browser does not support location access.",
    "Buscando tu ubicación. Permite el acceso en el navegador…":
      "Finding your location. Allow location access in your browser…",
    "Tu ubicación": "Your location",
    "Localizando…": "Finding location…",
    "El permiso de ubicación está desactivado.":
      "Location permission is disabled.",
    "No se pudo obtener tu ubicación.": "Unable to find your location.",
    "Sin conexión. Los datos visibles no se actualizarán hasta recuperar internet.":
      "You are offline. Displayed data will not update until the connection is restored.",
    España: "Spain",
    SO: "SW",
    O: "W",
    NO: "NW",
  };
  const original = new Map(Object.entries(english).map(([es, en]) => [en, es]));
  let language = "es";
  try {
    if (localStorage.getItem("weather-language") === "en") language = "en";
  } catch {}
  function t(message, values = {}) {
    const key = original.get(message) || message;
    const text = language === "en" ? english[key] || key : key;
    return text.replace(/\{(\w+)\}/g, (_, name) =>
      String(values[name] ?? `{${name}}`),
    );
  }
  function apply() {
    document.documentElement.lang = language;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    for (const attribute of ["aria-label", "placeholder"]) {
      document.querySelectorAll(`[data-i18n-${attribute}]`).forEach((el) => {
        el.setAttribute(
          attribute,
          t(el.getAttribute(`data-i18n-${attribute}`)),
        );
      });
    }
    document.getElementById("language").value = language;
  }
  function setLanguage(value) {
    if (!["es", "en"].includes(value) || value === language) return;
    language = value;
    try {
      localStorage.setItem("weather-language", language);
    } catch {}
    apply();
    document.dispatchEvent(new Event("weather:languagechange"));
  }
  return {
    t,
    apply,
    setLanguage,
    get language() {
      return language;
    },
    get locale() {
      return language === "en" ? "en-GB" : "es-ES";
    },
  };
})();
