"use strict";
const t = WeatherI18n.t;
/* Data and formatting. All weather values come from Open-Meteo; no sample forecasts. */
const $ = (id) => document.getElementById(id);
const icon = (name) =>
  `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const state = {
  data: null,
  place: {
    name: "Madrid",
    country: t("España"),
    latitude: 40.4168,
    longitude: -3.7038,
  },
  unit: "c",
  selected: null,
  day: 0,
  request: 0,
  loaded: 0,
};
try {
  state.place =
    JSON.parse(localStorage.getItem("weather-place")) || state.place;
  state.unit = localStorage.getItem("weather-unit") || "c";
} catch {}
function placeName(place = state.place) {
  return place.kind === "current-location" ||
    ["Tu ubicación", "Your location"].includes(place.name)
    ? t("Tu ubicación")
    : place.name;
}
function renderPlace() {
  $("city").textContent = placeName();
  let country = state.place.country;
  if (state.place.country_code) {
    try {
      country = new Intl.DisplayNames([WeatherI18n.locale], {
        type: "region",
      }).of(state.place.country_code);
    } catch {}
  } else if (country === "España" || country === "Spain") country = t("España");
  $("region").textContent = [state.place.admin1, country]
    .filter(Boolean)
    .join(", ");
}
const conditions = (code) => {
  if (code === 0) return [t("Despejado"), "sun"];
  if (code === 1) return [t("Mayormente despejado"), "partly"];
  if (code === 2) return [t("Parcialmente nublado"), "partly"];
  if (code === 3) return [t("Cielo cubierto"), "cloud"];
  if ([45, 48].includes(code)) return [t("Niebla"), "fog"];
  if ([51, 53, 55].includes(code)) return [t("Llovizna"), "rain"];
  if ([56, 57, 66, 67].includes(code)) return [t("Lluvia helada"), "rain"];
  if ([61, 63, 65].includes(code))
    return [code === 65 ? t("Lluvia intensa") : t("Lluvia"), "rain"];
  if ([71, 73, 75, 77].includes(code)) return [t("Nieve"), "snow"];
  if ([80, 81, 82].includes(code)) return [t("Chubascos"), "rain"];
  if ([85, 86].includes(code)) return [t("Chubascos de nieve"), "snow"];
  if ([95, 96, 99].includes(code)) return [t("Tormenta"), "storm"];
  return [t("Condición no disponible"), "cloud"];
};
const valid = (n) => typeof n === "number" && Number.isFinite(n);
const number = (n, d = 0) =>
  valid(n)
    ? n.toLocaleString(WeatherI18n.locale, { maximumFractionDigits: d })
    : "—";
const temp = (n) =>
  valid(n) ? Math.round(state.unit === "f" ? (n * 9) / 5 + 32 : n) + "°" : "—";
const fmt = (ts, opts) =>
  new Intl.DateTimeFormat(WeatherI18n.locale, {
    hourCycle: "h23",
    timeZone: state.data?.timezone || "Europe/Madrid",
    ...opts,
  }).format(new Date(ts * 1000));
const clock = (ts) =>
  valid(ts) ? fmt(ts, { hour: "2-digit", minute: "2-digit" }) : "—:—";
const dateKey = (ts) =>
  fmt(ts, { year: "numeric", month: "2-digit", day: "2-digit" });
function hourIndex(ts) {
  const a = state.data.hourly.time;
  let best = 0;
  for (let i = 1; i < a.length; i++)
    if (Math.abs(a[i] - ts) < Math.abs(a[best] - ts)) best = i;
  return best;
}
function dayIndex(ts) {
  const key = dateKey(ts);
  const index = state.data.daily.time.findIndex((t) => dateKey(t) === key);
  return Math.max(0, index);
}
function selectedWeather() {
  const d = state.data,
    h = d.hourly,
    i = state.selected ?? hourIndex(d.current.time);
  return {
    i,
    time: state.selected === null ? d.current.time : h.time[i],
    ...Object.fromEntries(
      Object.keys(h)
        .filter((k) => k !== "time")
        .map((k) => [k, h[k][i]]),
    ),
    ...(state.selected === null ? d.current : {}),
  };
}
function weatherIcon(code, day = true) {
  const type = conditions(code)[1];
  return icon(!day && ["sun", "partly"].includes(type) ? "moon" : type);
}
let lastStatus;
function status(message, error = false, retry = false) {
  lastStatus = { message, error, retry };
  $("status").className = "status" + (error ? " error" : "");
  $("status").replaceChildren();
  const span = document.createElement("span");
  span.className = "status-message";
  span.textContent = typeof message === "function" ? message() : t(message);
  $("status").append(span);
  if (retry) {
    const b = document.createElement("button");
    b.textContent = t("Reintentar");
    b.onclick = () => loadWeather(true);
    $("status").append(b);
  }
}
const cache = new Map();
async function fetchJSON(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("HTTP " + response.status);
  return response.json();
}
async function loadWeather(force = false) {
  const seq = ++state.request,
    place = { ...state.place };
  $("hero").classList.add("loading");
  if (!state.data) {
    $("temperature").textContent = "—";
    $("condition").textContent = t("Consultando el tiempo");
    $("condition-icon").replaceChildren();
    $("feels").textContent = t("Esperando las condiciones reales");
    $("max").textContent = t("Máx. —");
    $("min").textContent = t("Mín. —");
    $("datetime").textContent = t("Conectando con el cielo…");
    $("live").textContent = t("Conectando con Open-Meteo");
    $("hours").className = "empty";
    $("hours").textContent = t("La previsión horaria aparecerá aquí.");
    $("days").innerHTML =
      `<p class="empty">${t("Esperando la previsión de esta semana.")}</p>`;
    renderMetrics({});
    $("sunrise").textContent = $("sunset").textContent = "—:—";
    renderSunArc();
    $("return").hidden = true;
    $("day-caption").textContent = t(
      "Selecciona un día para explorar su previsión.",
    );
    $("details-time").textContent = t("Ahora");
  }
  renderPlace();
  status(t("Actualizando las condiciones meteorológicas…"));
  try {
    const key = `weather-${place.latitude.toFixed(3)}-${place.longitude.toFixed(3)}`;
    let cached = cache.get(key);
    try {
      cached = cached || JSON.parse(localStorage.getItem(key));
    } catch {}
    let data;
    if (!force && cached && Date.now() - cached.at < 600000) data = cached.data;
    else {
      const fields =
        "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m";
      const params = new URLSearchParams({
        latitude: place.latitude,
        longitude: place.longitude,
        current: fields,
        hourly: fields + ",precipitation_probability,visibility,uv_index",
        daily:
          "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,uv_index_max",
        timezone: "auto",
        timeformat: "unixtime",
        forecast_days: "8",
      });
      data = await fetchJSON(
        "https://api.open-meteo.com/v1/forecast?" + params,
      );
      if (
        !data.current ||
        !data.hourly?.time?.length ||
        !data.daily?.time?.length
      )
        throw Error("Invalid forecast");
      const entry = { at: Date.now(), data };
      cache.set(key, entry);
      try {
        localStorage.setItem(key, JSON.stringify(entry));
      } catch {}
    }
    if (seq !== state.request) return;
    state.data = data;
    state.selected = null;
    state.day = 0;
    state.loaded = Date.now();
    try {
      localStorage.setItem("weather-place", JSON.stringify(place));
    } catch {}
    render();
    status(() =>
      t("Actualizado a las {time} · Hora local de {city}", {
        time: clock(data.current.time),
        city: placeName(place),
      }) + (place.kind === "ip-location"
        ? " · " + t("Ubicación aproximada") : ""),
    );
    $("hour-scroll").scrollLeft = 0;
  } catch (error) {
    if (seq !== state.request) return;
    status(
      navigator.onLine
        ? t(
            "No se ha podido obtener el tiempo. Comprueba la conexión y vuelve a intentarlo.",
          )
        : t("Sin conexión. Conéctate a internet para consultar el tiempo."),
      true,
      true,
    );
    if (!state.data) {
      $("condition").textContent = t("No hay datos disponibles");
      $("feels").textContent = t(
        "Reintenta la consulta para ver las condiciones reales",
      );
      $("live").textContent = t("Sin datos meteorológicos");
      $("datetime").textContent = t(
        "La conexión con Open-Meteo no está disponible",
      );
    } else $("live").textContent = t("Datos anteriores · sin actualizar");
  } finally {
    if (seq === state.request) $("hero").classList.remove("loading");
  }
}
function render() {
  if (!state.data) return;
  const focused = document.activeElement;
  const keyboardFocus = focused?.matches(":focus-visible");
  const focusHour = keyboardFocus ? focused?.dataset.hour : undefined,
    focusDay = keyboardFocus ? focused?.dataset.day : undefined;
  const d = state.data,
    w = selectedWeather(),
    di = dayIndex(w.time),
    daily = d.daily;
  state.day = di;
  const condition = conditions(w.weather_code);
  renderPlace();
  $("datetime").textContent =
    fmt(w.time, { weekday: "long", day: "numeric", month: "long" }) +
    " · " +
    clock(w.time);
  $("temperature").textContent = valid(w.temperature_2m)
    ? temp(w.temperature_2m).slice(0, -1)
    : "—";
  $("degree").textContent = state.unit === "f" ? "°F" : "°C";
  $("condition").textContent = condition[0];
  $("condition-icon").innerHTML = weatherIcon(w.weather_code, w.is_day);
  $("feels").textContent = t("Sensación térmica de {temperature}", {
    temperature: temp(w.apparent_temperature),
  });
  $("max").textContent =
    "↑ " + temp(daily.temperature_2m_max[di]) + " " + t("máx.");
  $("min").textContent =
    "↓ " + temp(daily.temperature_2m_min[di]) + " " + t("mín.");
  $("live").textContent =
    state.selected === null
      ? t("Condiciones actuales")
      : t("Previsión") +
        " · " +
        fmt(w.time, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
  $("return").hidden = state.selected === null;
  $("details-time").textContent =
    state.selected === null ? t("Ahora") : clock(w.time);
  $("sunrise").textContent = clock(daily.sunrise[di]);
  $("sunset").textContent = clock(daily.sunset[di]);
  renderSunArc(w.time, daily.sunrise[di], daily.sunset[di]);
  $("day-caption").textContent =
    fmt(daily.time[di], {
      weekday: "long",
      day: "numeric",
      month: "long",
    }) +
    " · " +
    t("{amount} mm de precipitación prevista", {
      amount: number(daily.precipitation_sum[di], 1),
    });
  renderHours();
  renderDays();
  renderMetrics(w);
  setScene(w, di);
  if (focusHour !== undefined)
    document
      .querySelector(`[data-hour="${focusHour}"]`)
      ?.focus({ preventScroll: true });
  if (focusDay !== undefined)
    document
      .querySelector(`[data-day="${focusDay}"]`)
      ?.focus({ preventScroll: true });
  document
    .querySelectorAll("[data-unit]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.unit === state.unit),
    );
}
// This is daylight progress, not an astronomical elevation diagram.
function renderSunArc(time, sunrise, sunset) {
  const available = [time, sunrise, sunset].every(valid) && sunset > sunrise;
  const daylight = available && time >= sunrise && time <= sunset;
  const sun = $("sun-position");
  sun.setAttribute("visibility", daylight ? "visible" : "hidden");
  let label = t("Recorrido diurno no disponible");
  if (available) {
    if (daylight) {
      const progress = (time - sunrise) / (sunset - sunrise);
      const angle = Math.PI * progress;
      sun.setAttribute("cx", 60 - 56 * Math.cos(angle));
      sun.setAttribute("cy", 35 - 29 * Math.sin(angle));
      label = t("{time} · {percent}% de las horas de luz transcurridas", {
        time: clock(time), percent: Math.round(progress * 100),
      });
    } else label = t("{time} · Fuera de las horas de luz", { time: clock(time) });
  }
  $("sun-arc-title").textContent = label;
}
function renderHours() {
  const h = state.data.hourly,
    start = hourIndex(state.data.current.time);
  const indexes = Array.from({ length: 24 }, (_, n) => start + n).filter(
    (i) => i < h.time.length,
  );
  const values = indexes.map((i) => h.temperature_2m[i]),
    min = Math.min(...values),
    max = Math.max(...values);
  const points = values.map((v, n) => [
    40 + n * 80,
    20 - ((v - min) / (max - min || 1)) * 16,
  ]);
  $("hours").className = "hour-inner";
  $("hours").innerHTML =
    `<svg class="temp-graph" viewBox="0 0 1920 25" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#92ad80" stop-opacity=".2"/><stop offset="1" stop-color="#92ad80" stop-opacity="0"/></linearGradient></defs><path d="M${points.map((p) => p.join(",")).join(" L")} L${points.at(-1)[0]},25 L40,25Z" fill="url(#chart-fill)"/><polyline points="${points.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#9aad80" stroke-width="1.5"/></svg><div class="hour-list">${indexes.map((i, n) => `<button class="hour" data-hour="${i}" aria-pressed="${state.selected === i || (state.selected === null && n === 0)}" aria-label="${t("Ver previsión: {time}, {temperature}, {condition}", { time: clock(h.time[i]), temperature: temp(h.temperature_2m[i]), condition: conditions(h.weather_code[i])[0] })}"><span>${n === 0 ? t("Ahora") : clock(h.time[i])}</span>${weatherIcon(h.weather_code[i], h.is_day[i])}<span class="hour-temp">${temp(h.temperature_2m[i])}</span><span class="rain">${icon("drop")}${number(h.precipitation_probability[i])}%</span></button>`).join("")}</div>`;
}
function renderDays() {
  const d = state.data.daily,
    min = Math.min(...d.temperature_2m_min.slice(0, 7)),
    max = Math.max(...d.temperature_2m_max.slice(0, 7));
  $("days").innerHTML = d.time
    .slice(0, 7)
    .map(
      (timestamp, i) =>
        `<button class="day" data-day="${i}" aria-pressed="${state.day === i}" aria-label="${WeatherI18n.t("Consultar {day}, máxima {high}, mínima {low}", { day: fmt(timestamp, { weekday: "long" }), high: temp(d.temperature_2m_max[i]), low: temp(d.temperature_2m_min[i]) })}"><span>${i === 0 ? t("Hoy") : fmt(timestamp, { weekday: "short" }).replace(".", "")}</span>${weatherIcon(d.weather_code[i])}<span class="desc">${conditions(d.weather_code[i])[0]}</span><span class="min">${temp(d.temperature_2m_min[i])}</span><span class="range"><span style="left:${((d.temperature_2m_min[i] - min) / (max - min || 1)) * 100}%;width:${Math.max(4, ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / (max - min || 1)) * 100)}%"></span></span><span>${temp(d.temperature_2m_max[i])}</span><span class="prob">${number(d.precipitation_probability_max[i])}%</span></button>`,
    )
    .join("");
}
function renderMetrics(w) {
  const direction = valid(w.wind_direction_10m)
    ? ["N", "NE", "E", "SE", "S", t("SO"), t("O"), t("NO")][
        Math.round(w.wind_direction_10m / 45) % 8
      ]
    : "—";
  const uv = w.uv_index;
  const metrics = [
    [
      "drop",
      t("Humedad"),
      number(w.relative_humidity_2m),
      "%",
      t("Humedad relativa"),
    ],
    [
      "wind",
      t("Viento"),
      number(w.wind_speed_10m),
      "km/h",
      t("Dirección {direction}", { direction }),
    ],
    [
      "sun",
      t("Índice UV"),
      number(uv, 1),
      "",
      !valid(uv)
        ? t("Sin datos")
        : uv < 3
          ? t("Exposición baja")
          : uv < 6
            ? t("Exposición moderada")
            : uv < 8
              ? t("Exposición alta")
              : t("Exposición muy alta"),
    ],
    [
      "rain",
      t("Precipitación"),
      number(w.precipitation, 1),
      "mm",
      t("En esta hora"),
    ],
    [
      "eye",
      t("Visibilidad"),
      number(valid(w.visibility) ? w.visibility / 1000 : null, 1),
      "km",
      t("Al nivel del suelo"),
    ],
    [
      "cloud",
      t("Prob. de lluvia"),
      number(w.precipitation_probability),
      "%",
      t("En esta hora"),
    ],
  ];
  $("metrics").innerHTML = metrics
    .map(
      ([ico, label, value, unit, note]) =>
        `<div class="metric"><div class="metric-title">${icon(ico)}${label}</div><div class="metric-value">${value}<small>${unit}</small></div><div class="metric-foot">${note}</div></div>`,
    )
    .join("");
}
/* Search, navigation and persistence. Abort stale suggestions and ignore stale forecasts. */
let searchTimer, searchController;
function closeSearch() {
  $("suggestions").replaceChildren();
  $("search").setAttribute("aria-expanded", "false");
}
$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchController?.abort();
  const query = $("search").value.trim();
  closeSearch();
  if (query.length < 2) return;
  searchTimer = setTimeout(async () => {
    searchController = new AbortController();
    $("suggestions").innerHTML =
      `<div class="search-message">${t("Buscando ciudades…")}</div>`;
    $("search").setAttribute("aria-expanded", "true");
    try {
      const data = await fetch(
        "https://geocoding-api.open-meteo.com/v1/search?" +
          new URLSearchParams({
            name: query,
            count: 6,
            language: WeatherI18n.language,
            format: "json",
          }),
        { signal: searchController.signal },
      ).then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      });
      if ($("search").value.trim() !== query) return;
      $("suggestions").replaceChildren();
      if (!data.results?.length) {
        $("suggestions").innerHTML =
          `<div class="search-message">${t("No se encontraron ciudades. Prueba otro nombre.")}</div>`;
        return;
      }
      data.results.forEach((p) => {
        const b = document.createElement("button");
        const title = document.createElement("span");
        title.textContent = p.name;
        const sub = document.createElement("small");
        sub.textContent = [p.admin1, p.country].filter(Boolean).join(", ");
        b.append(title, sub);
        b.onclick = () => {
          ++locationRequest;
          $("locate").disabled = false;
          state.place = p;
          state.data = null;
          closeSearch();
          $("search").value = "";
          loadWeather();
        };
        $("suggestions").append(b);
      });
    } catch (e) {
      if (e.name !== "AbortError")
        $("suggestions").innerHTML =
          `<div class="search-message">${t("No se pudo buscar. Comprueba tu conexión e inténtalo de nuevo.")}</div>`;
    }
  }, 320);
});
$("search").addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSearch();
  if (e.key === "ArrowDown") {
    e.preventDefault();
    $("suggestions").querySelector("button")?.focus();
  }
});
$("suggestions").addEventListener("keydown", (e) => {
  const buttons = [...$("suggestions").querySelectorAll("button")],
    i = buttons.indexOf(document.activeElement);
  if (e.key === "ArrowDown") {
    e.preventDefault();
    buttons[(i + 1) % buttons.length]?.focus();
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (i === 0) $("search").focus();
    else buttons[i - 1]?.focus();
  }
  if (e.key === "Escape") {
    $("search").focus();
    closeSearch();
  }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search")) closeSearch();
});
let locationRequest = 0;
async function detectApproximateLocation() {
  const request = ++locationRequest;
  $("city").textContent = t("Tu ubicación");
  $("region").textContent = t("Localizando…");
  status(t("Buscando una ubicación aproximada…"));
  try {
    // Run in the browser so ipapi locates the visitor's IP, not a server's.
    const place = await fetchJSON("https://ipapi.co/json/");
    if (request !== locationRequest) return;
    if (
      place.error || !valid(place.latitude) || !valid(place.longitude) ||
      Math.abs(place.latitude) > 90 || Math.abs(place.longitude) > 180 ||
      typeof place.city !== "string" || !place.city.trim()
    ) throw Error("Invalid IP location");
    state.place = {
      kind: "ip-location",
      name: place.city,
      admin1: place.region,
      country: place.country_name,
      country_code: place.country_code,
      latitude: place.latitude,
      longitude: place.longitude,
    };
    await loadWeather();
  } catch {
    if (request !== locationRequest) return;
    await loadWeather();
    if (request === locationRequest && state.data)
      status(() => t("No se pudo estimar tu ubicación.") + " " +
        t("Mostrando {city}. Puedes buscar otra ciudad.", {
          city: placeName(state.place),
        }));
  }
}
function detectLocation() {
  const request = ++locationRequest;
  const fallback = async (message) => {
    if (request !== locationRequest) return;
    $("locate").disabled = false;
    if (!state.data) await loadWeather();
    if (request !== locationRequest) return;
    status(() => t(message) + " " + t("Puedes buscar tu ciudad."), true);
  };
  if (!navigator.geolocation) {
    fallback(t("Este navegador no permite usar la ubicación."));
    return;
  }
  $("locate").disabled = true;
  status(t("Buscando tu ubicación. Permite el acceso en el navegador…"));
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (request !== locationRequest) return;
      $("locate").disabled = false;
      state.place = {
        kind: "current-location",
        name: "Tu ubicación",
        country: `${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      state.data = null;
      loadWeather();
    },
    (error) =>
      fallback(
        error.code === 1
          ? t("El permiso de ubicación está desactivado.")
          : t("No se pudo obtener tu ubicación."),
      ),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
  );
}
$("locate").onclick = () => detectLocation();
document.querySelectorAll("[data-unit]").forEach(
  (b) =>
    (b.onclick = () => {
      state.unit = b.dataset.unit;
      try {
        localStorage.setItem("weather-unit", state.unit);
      } catch {}
      if (state.data) render();
      else
        document
          .querySelectorAll("[data-unit]")
          .forEach((x) => x.setAttribute("aria-pressed", x === b));
    }),
);
$("hours").addEventListener("click", (e) => {
  const b = e.target.closest("[data-hour]");
  if (!b) return;
  state.selected = +b.dataset.hour;
  render();
});
// A daily WMO code describes the day's most significant weather, not noon.
// Select a real matching forecast hour rather than applying that code to noon.
function representativeHour(di) {
  const h = state.data.hourly;
  const dailyType = conditions(state.data.daily.weather_code[di])[1];
  const hours = h.time
    .map((_, i) => i)
    .filter((i) => dayIndex(h.time[i]) === di);
  const matching = hours.filter(
    (i) => conditions(h.weather_code[i])[1] === dailyType,
  );
  const exact = hours.filter(
    (i) => h.weather_code[i] === state.data.daily.weather_code[di],
  );
  const candidates = exact.length ? exact : matching.length ? matching : hours;
  const wet = ["rain", "snow", "storm"].includes(dailyType);
  const distanceFromNoon = (i) =>
    Math.abs(
      Number(fmt(h.time[i], { hour: "2-digit", hourCycle: "h23" })) - 12,
    );
  return candidates.reduce(
    (best, i) => {
      const precipitation = wet
        ? (h.precipitation[i] || 0) - (h.precipitation[best] || 0)
        : 0;
      return precipitation > 0 ||
        (precipitation === 0 && distanceFromNoon(i) < distanceFromNoon(best))
        ? i
        : best;
    },
    candidates[0] ?? hourIndex(state.data.daily.time[di]),
  );
}
$("days").addEventListener("click", (e) => {
  const b = e.target.closest("[data-day]");
  if (!b) return;
  state.selected = representativeHour(+b.dataset.day);
  render();
});
$("return").onclick = () => {
  state.selected = null;
  render();
};
$("prev-hours").onclick = () =>
  $("hour-scroll").scrollBy({ left: -480, behavior: "smooth" });
$("next-hours").onclick = () =>
  $("hour-scroll").scrollBy({ left: 480, behavior: "smooth" });
window.addEventListener("online", () => loadWeather(true));
window.addEventListener("offline", () =>
  status(
    t(
      "Sin conexión. Los datos visibles no se actualizarán hasta recuperar internet.",
    ),
    true,
    true,
  ),
);
setInterval(() => {
  if (!document.hidden && Date.now() - state.loaded >= 600000) loadWeather();
}, 60000);
/* Living landscape: vector geometry rendered on Canvas, layered atmospheric depth,
smoothly interpolated lighting and weather, frame cap and reduced-motion support. */
const canvas = $("landscape"),
  ctx = canvas.getContext("2d");
let width = 1200,
  height = 500,
  dpr = 1,
  frame = 0,
  lastFrame = 0,
  elapsed = 0,
  previousTime = 0,
  lightningAt = Infinity,
  lightning = null,
  flash = 0,
  snowCover = 0;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let target = {
    night: 0,
    dusk: 0,
    cloud: 0.15,
    rain: 0,
    shower: 0,
    snow: 0,
    fog: 0,
    storm: 0,
    wind: 8,
    sun: 0.63,
  },
  scene = { ...target };
const rand = (n) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
// Integrate movement per frame: changing velocity must not recalculate
// the distance travelled since the animation began.
let particleFall = 0,
  particleDrift = 0;
function updatePrecipitation(dt) {
  const speed =
    scene.snow > 0.2
      ? 13
      : (700 + scene.rain * 700 + scene.shower * 220 + scene.storm * 260) *
        Math.max(1, height / 900);
  particleFall += speed * dt;
  particleDrift += (scene.snow > 0.2 ? 12 : 50) * (1 + scene.wind * 0.025) * dt;
}
const particles = Array.from({ length: 210 }, (_, i) => ({
  x: rand(i + 1),
  y: rand(i + 230),
  z: 0.25 + rand(i + 560) * 0.75,
}));
function setScene(w, di) {
  const d = state.data.daily,
    rise = d.sunrise[di],
    set = d.sunset[di],
    time = w.time,
    type = conditions(w.weather_code)[1];
  const night =
    valid(rise) && valid(set)
      ? Math.max(
          0,
          Math.min(1, Math.max((rise - time) / 3600, (time - set) / 3600)),
        )
      : w.is_day
        ? 0
        : 1;
  const dusk =
    valid(rise) && valid(set)
      ? Math.max(
          0,
          1 - Math.min(Math.abs(time - rise), Math.abs(time - set)) / 4200,
        )
      : 0;
  const shower = [80, 81, 82].includes(w.weather_code);
  const wet = type === "rain" || type === "storm";
  const rainBase =
    type === "storm"
      ? 0.9
      : shower
        ? { 80: 0.65, 81: 0.82, 82: 1 }[w.weather_code]
        : [51, 53, 55, 56, 57].includes(w.weather_code)
          ? 0.2
          : 0.38;
  const cloudCover = valid(w.cloud_cover)
    ? w.cloud_cover / 100
    : type === "cloud"
      ? 1
      : 0.1;
  const enteringStorm = type === "storm" && target.storm < 0.5;
  target = {
    night,
    dusk,
    cloud: Math.max(
      cloudCover,
      type === "storm" ? 1 : shower ? 0.94 : wet ? 0.78 : 0,
    ),
    rain: wet ? Math.min(1, rainBase + (w.precipitation || 0) / 3) : 0,
    shower: shower ? 1 : 0,
    snow: type === "snow" ? Math.min(1, 0.35 + (w.precipitation || 0) / 3) : 0,
    fog: type === "fog" ? 1 : 0,
    storm: type === "storm" ? 1 : 0,
    wind: w.wind_speed_10m || 0,
    sun:
      valid(rise) && valid(set)
        ? Math.max(0, Math.min(1, (time - rise) / (set - rise)))
        : 0.5,
  };
  if (enteringStorm) lightningAt = elapsed + 0.8 + Math.random() * 1.2;
  if (!target.storm || reduced.matches) {
    lightningAt = Infinity;
    lightning = null;
    flash = 0;
  }
  if (reduced.matches) {
    scene = { ...target };
    snowCover = target.snow;
    draw(0);
  }
}
const landscapeCache = document.createElement("canvas");
const landscapeCacheContext = landscapeCache.getContext("2d");
let lastLandscapeTime = -Infinity;

function resize() {
  const rect = canvas.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  dpr = Math.min(devicePixelRatio || 1, 1.75);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  landscapeCache.width = canvas.width;
  landscapeCache.height = canvas.height;
  lastLandscapeTime = -Infinity;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (reduced.matches) draw(0);
}
new ResizeObserver(resize).observe(canvas);
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const rgb = (a) => `rgb(${a.join(",")})`;
const blend = (day, night) => mix(day, night, scene.night);
function polygon(points, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  points.forEach((p, i) =>
    i
      ? ctx.lineTo(p[0] * width, p[1] * height)
      : ctx.moveTo(p[0] * width, p[1] * height),
  );
  ctx.closePath();
  ctx.fill();
}
function mountain(seed, base, peak, fill) {
  const pts = [
    [-0.1, 1],
    [-0.1, base],
  ];
  for (let i = 0; i <= 26; i++) {
    const x = i / 25;
    const y =
      base -
      Math.sin(x * 9 + seed) * 0.045 -
      Math.sin(x * 17 + seed * 2) * 0.027 -
      (Math.sin(x * 4 + seed) * 0.5 + 0.5) * peak;
    pts.push([x, y]);
  }
  pts.push([1.1, 1]);
  polygon(pts, fill);
}
function pine(x, y, size, seed, t, fill, snow = false) {
  const sway = reduced.matches
    ? 0
    : Math.sin(t * 0.75 + seed) * Math.min(0.07, 0.01 + scene.wind * 0.0015);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(sway);
  ctx.fillStyle = fill;
  ctx.fillRect(-size * 0.025, -size * 0.8, size * 0.05, size * 0.85);
  for (let layer = 0; layer < 6; layer++) {
    const top = -size + layer * size * 0.125,
      span = size * (0.13 + layer * 0.047);
    ctx.beginPath();
    ctx.moveTo(0, top);
    ctx.bezierCurveTo(
      -span * 0.2,
      top + size * 0.12,
      -span * 0.6,
      top + size * 0.22,
      -span,
      top + size * 0.27,
    );
    ctx.quadraticCurveTo(0, top + size * 0.23, span, top + size * 0.27);
    ctx.bezierCurveTo(
      span * 0.6,
      top + size * 0.22,
      span * 0.2,
      top + size * 0.12,
      0,
      top,
    );
    ctx.fill();
    if (snow) {
      ctx.fillStyle = `rgba(227,238,231,${snowCover * 0.9})`;
      ctx.beginPath();
      ctx.moveTo(0, top);
      ctx.lineTo(-span * 0.65, top + size * 0.19);
      ctx.quadraticCurveTo(
        0,
        top + size * 0.15,
        span * 0.65,
        top + size * 0.19,
      );
      ctx.fill();
      ctx.fillStyle = fill;
    }
  }
  ctx.restore();
}
function cloud(x, y, s, opacity, shade) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = `rgba(${shade.join(",")},${opacity})`;
  ctx.beginPath();
  ctx.moveTo(-100, 15);
  ctx.bezierCurveTo(-130, -5, -100, -35, -65, -28);
  ctx.bezierCurveTo(-65, -70, 0, -78, 20, -48);
  ctx.bezierCurveTo(60, -62, 100, -37, 96, -11);
  ctx.bezierCurveTo(147, -10, 150, 22, 105, 26);
  ctx.bezierCurveTo(30, 36, -55, 31, -100, 15);
  ctx.fill();
  ctx.restore();
}
function drawLandscape(t) {
  ctx.clearRect(0, 0, width, height);
  const s = scene;
  const top = mix(
    blend([112, 169, 193], [12, 23, 44]),
    [107, 126, 140],
    s.cloud * 0.6 * (1 - s.night * 0.7),
  );
  const warm = mix(
    blend([221, 231, 206], [57, 75, 89]),
    [235, 166, 121],
    s.dusk * (1 - s.cloud * 0.6),
  );
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.78);
  sky.addColorStop(0, rgb(top));
  sky.addColorStop(0.72, rgb(warm));
  sky.addColorStop(1, rgb(blend([227, 228, 188], [59, 77, 81])));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  // Stars remain behind cloud layers.
  if (s.night > 0.05) {
    for (let i = 0; i < 65; i++) {
      ctx.fillStyle = `rgba(236,243,230,${s.night * (1 - s.cloud * 0.9) * (0.35 + rand(i + 80) * 0.5)})`;
      ctx.beginPath();
      ctx.arc(
        rand(i + 900) * width,
        rand(i + 500) * height * 0.48,
        0.5 + rand(i + 100),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  const sunX = width * (0.36 + s.sun * 0.51),
    sunY = height * (0.48 - Math.sin(s.sun * Math.PI) * 0.34);
  const celestial = ctx.createRadialGradient(
    sunX,
    sunY,
    3,
    sunX,
    sunY,
    height * 0.32,
  );
  celestial.addColorStop(
    0,
    `rgba(255,232,161,${(1 - s.night) * (1 - s.cloud) * 0.35})`,
  );
  celestial.addColorStop(1, "rgba(255,225,165,0)");
  ctx.fillStyle = celestial;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = (1 - s.night) * (1 - s.cloud * 0.85);
  ctx.fillStyle = "#fff0c0";
  ctx.beginPath();
  ctx.arc(sunX, sunY, height * 0.035, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (s.night > 0.05) {
    ctx.globalAlpha = s.night * (1 - s.cloud * 0.85);
    ctx.fillStyle = "#e3e9d8";
    ctx.beginPath();
    ctx.arc(width * 0.78, height * 0.19, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgb(top);
    ctx.beginPath();
    ctx.arc(width * 0.78 + 6, height * 0.19 - 4, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < 16; i++) {
    const travel = t * (2 + s.wind * 0.12) * (i % 2 ? 1 : 0.6);
    const x =
      ((rand(i + 60) * width * 1.5 + travel) % (width * 1.5)) - width * 0.25;
    cloud(
      x,
      height * (0.08 + rand(i + 12) * 0.25),
      (0.55 + rand(i + 17)) * (width / 1300 + 0.25) * (1 + s.cloud * 0.2),
      (0.12 + s.cloud * 0.62) * (i < 3 ? 1 : 0.65) * (i < 10 ? 1 : s.cloud),
      blend(
        mix(
          [247, 248, 229],
          [117, 134, 143],
          Math.min(0.9, s.storm * 0.75 + s.rain * 0.35 + s.shower * 0.15),
        ),
        [59, 71, 88],
      ),
    );
  }
  mountain(
    1.4,
    0.64,
    0.17,
    rgb(blend(mix([136, 171, 171], [126, 146, 150], s.cloud), [39, 59, 74])),
  );
  mountain(3.6, 0.74, 0.21, rgb(blend([99, 143, 146], [29, 53, 66])));
  mountain(2, 0.82, 0.25, rgb(blend([74, 120, 123], [24, 47, 58])));
  // Fill the entire mountain before adding its illuminated rock face.
  // The face alone leaves a sky-colored opening below the ridge.
  polygon(
    [
      [0.38, 0.64],
      [0.49, 0.39],
      [0.55, 0.48],
      [0.6, 0.42],
      [0.69, 0.64],
      [0.69, 0.85],
      [0.38, 0.85],
    ],
    rgb(blend(mix([105, 143, 140], [181, 199, 194], snowCover), [40, 61, 72])),
  );
  polygon(
    [
      [0.38, 0.64],
      [0.49, 0.39],
      [0.55, 0.48],
      [0.6, 0.42],
      [0.69, 0.64],
      [0.6, 0.58],
      [0.54, 0.56],
      [0.49, 0.47],
      [0.45, 0.59],
    ],
    rgb(blend(mix([160, 181, 174], [203, 216, 210], snowCover), [63, 78, 85])),
  );
  mountain(5, 0.88, 0.19, rgb(blend([59, 105, 102], [18, 43, 47])));
  const lake = ctx.createLinearGradient(0, height * 0.65, 0, height);
  lake.addColorStop(0, rgb(blend([154, 188, 175], [44, 70, 73])));
  lake.addColorStop(0.5, rgb(blend([105, 157, 145], [24, 52, 58])));
  lake.addColorStop(1, rgb(blend([79, 131, 119], [17, 43, 44])));
  polygon(
    [
      [0.0, 1],
      [0.16, 0.9],
      [0.4, 0.75],
      [0.53, 0.68],
      [0.64, 0.68],
      [0.59, 0.73],
      [0.77, 0.83],
      [0.92, 1],
    ],
    lake,
  );
  ctx.lineWidth = 1;
  for (let i = 0; i < 32; i++) {
    const y = height * (0.7 + rand(i + 840) * 0.28),
      x = width * (0.3 + rand(i + 441) * 0.45);
    ctx.strokeStyle = `rgba(211,230,196,${(1 - s.night * 0.8) * (0.045 + rand(i + 47) * 0.12)})`;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(t * 0.3 + i) * 7, y);
    ctx.lineTo(x + 20 + rand(i + 77) * 65, y);
    ctx.stroke();
  }
  polygon(
    [
      [0, 0.76],
      [0.14, 0.7],
      [0.28, 0.76],
      [0.38, 0.79],
      [0.26, 0.86],
      [0.15, 0.89],
      [0, 1],
    ],
    rgb(
      blend(mix([62, 105, 81], [200, 215, 204], snowCover * 0.9), [19, 45, 36]),
    ),
  );
  polygon(
    [
      [0.66, 0.74],
      [0.83, 0.68],
      [1, 0.73],
      [1, 1],
      [0.86, 0.94],
      [0.73, 0.84],
    ],
    rgb(
      blend(mix([69, 113, 81], [205, 218, 206], snowCover * 0.8), [21, 45, 36]),
    ),
  );
  // Distant forest is static geometry; only a small set of foreground trees sways.
  for (let i = 0; i < 90; i++) {
    const x = rand(i + 567) * width,
      y = height * (0.68 + rand(i + 776) * 0.13);
    if (x > width * 0.4 && x < width * 0.68) continue;
    pine(
      x,
      y,
      15 + rand(i + 33) * 38,
      i,
      0,
      rgb(blend([48, 94, 77], [17, 41, 35])),
      true,
    );
  }
  for (let i = 0; i < 14; i++) {
    const side = i < 8,
      x = side
        ? width * (0.01 + rand(i + 130) * 0.22)
        : width * (0.84 + rand(i + 13) * 0.18),
      y = height * (0.94 + rand(i + 1) * 0.1);
    pine(
      x,
      y,
      height * (0.19 + rand(i + 380) * 0.3),
      i,
      t,
      rgb(
        blend(mix([36, 77, 57], [111, 143, 123], s.cloud * 0.25), [12, 32, 25]),
      ),
      true,
    );
  }
  polygon(
    [
      [0, 0.95],
      [0.1, 0.92],
      [0.18, 0.95],
      [0.29, 1],
      [0, 1],
    ],
    rgb(blend(mix([41, 78, 48], [208, 221, 207], snowCover), [14, 32, 23])),
  );
  polygon(
    [
      [0.77, 1],
      [0.88, 0.94],
      [1, 0.91],
      [1, 1],
    ],
    rgb(blend(mix([49, 84, 49], [211, 222, 208], snowCover), [15, 34, 24])),
  );
  for (let i = 0; i < 48; i++) {
    const x = rand(i + 714) * width,
      y = height * (0.965 + rand(i + 820) * 0.05),
      len = 7 + rand(i + 122) * 20;
    if (x > width * 0.27 && x < width * 0.8) continue;
    ctx.strokeStyle = rgb(blend([101, 133, 70], [34, 57, 35]));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const bend = Math.sin(t * 1.3 + i) * (1 + s.wind * 0.08);
    ctx.quadraticCurveTo(x + bend, y - len * 0.5, x + bend * 2 + 4, y - len);
    ctx.stroke();
    if (i % 6 === 0 && s.snow < 0.2) {
      ctx.fillStyle = rgb(blend([224, 206, 130], [83, 91, 55]));
      ctx.beginPath();
      ctx.arc(
        x + bend * 2 + 4,
        y - len,
        1.7 + Math.sin(t * 0.15 + i) * 0.3,
        0,
        7,
      );
      ctx.fill();
    }
  }
  // Occasional small flocks, with phase offset rather than synchronized wings.
  if (s.rain < 0.1 && s.snow < 0.1 && s.night < 0.3) {
    const cycle = t % 62;
    if (cycle < 22)
      for (let i = 0; i < 4; i++) {
        const x = width * (1.1 - cycle / 25) + i * 17,
          y = height * 0.3 + Math.sin(cycle * 0.18 + i) * 8 + i * 5;
        ctx.strokeStyle = "rgba(38,66,65,.6)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const wing = Math.sin(t * 5 + i) * 3;
        ctx.moveTo(x - 5, y + wing);
        ctx.quadraticCurveTo(x - 2, y - 2, x, y);
        ctx.quadraticCurveTo(x + 2, y - 2, x + 5, y + wing);
        ctx.stroke();
      }
  }
  if (s.fog > 0.01) {
    for (let i = 0; i < 4; i++) {
      const fog = ctx.createLinearGradient(
        0,
        height * (0.35 + i * 0.11),
        0,
        height * (0.58 + i * 0.11),
      );
      fog.addColorStop(0, "rgba(206,220,214,0)");
      fog.addColorStop(0.5, `rgba(206,220,214,${s.fog * 0.26})`);
      fog.addColorStop(1, "rgba(206,220,214,0)");
      ctx.fillStyle = fog;
      ctx.save();
      ctx.translate(Math.sin(t * 0.06 + i) * 40, 0);
      ctx.fillRect(-50, height * (0.32 + i * 0.11), width + 100, height * 0.3);
      ctx.restore();
    }
  }
}
function draw(t) {
  if (reduced.matches || t - lastLandscapeTime >= 1 / 30 - 0.001) {
    drawLandscape(t);
    landscapeCacheContext.drawImage(canvas, 0, 0);
    lastLandscapeTime = t;
  } else {
    ctx.drawImage(landscapeCache, 0, 0, width, height);
  }
  const s = scene;
  const count = Math.floor(
    Math.min(
      210,
      Math.min(200, width * 0.22) * (s.rain + s.snow) * (1 + s.shower * 0.35),
    ),
  );
  if (count > 0) {
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const y = ((p.y * height + particleFall * p.z) % (height + 30)) - 15;
      const x =
        ((p.x * width +
          particleDrift * p.z +
          Math.sin(t * 0.5 + i) * 12 * s.snow) %
          (width + 50)) -
        25;
      ctx.strokeStyle = `rgba(208,226,226,${0.15 + p.z * 0.45 + s.shower * 0.15})`;
      ctx.fillStyle = `rgba(241,247,243,${p.z * 0.8})`;
      if (s.snow > 0.2) {
        ctx.beginPath();
        ctx.arc(x, y, 1 + p.z * 2, 0, 7);
        ctx.fill();
      } else {
        ctx.lineWidth = 0.5 + p.z;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x + 3 + s.wind * 0.12,
          y + 9 + p.z * 12 + s.rain * 6 + s.shower * 8,
        );
        ctx.stroke();
      }
    }
    if (s.rain > 0.05) {
      for (let i = 0; i < 14; i++) {
        const phase = (t * 0.6 + rand(i + 990)) % 1,
          x = width * (0.32 + rand(i + 330) * 0.38),
          y = height * (0.8 + rand(i + 880) * 0.18);
        ctx.strokeStyle = `rgba(210,230,215,${(1 - phase) * s.rain * 0.25})`;
        ctx.beginPath();
        ctx.ellipse(x, y, phase * 15, phase * 3, 0, 0, 7);
        ctx.stroke();
      }
    }
  }
  drawLightning(t);
}

// Lightning follows animation time, so duration does not depend on frame rate.
function createLightning() {
  const shell = document.querySelector(".shell");
  const gutter = Math.max(
    20,
    shell.getBoundingClientRect().left +
      parseFloat(getComputedStyle(shell).paddingLeft),
  );
  const right = Math.random() > 0.5;
  const origin = right ? width - gutter * 0.55 : gutter * 0.55;
  const amplitude = Math.min(65, gutter * 0.4);
  const path = [];
  for (let i = 0; i <= 12; i++) {
    path.push([
      (origin + (i ? (Math.random() - 0.5) * amplitude : 0)) / width,
      0.025 + (i / 12) * 0.72,
    ]);
  }
  const branches = [4, 7, 9].map((index) => {
    const [x, y] = path[index];
    const direction = right ? -1 : 1;
    return [
      [x, y],
      [x + ((direction * amplitude) / width) * 0.4, y + 0.035],
      [x + ((direction * amplitude) / width) * 0.7, y + 0.085],
    ];
  });
  return {
    path,
    branches,
    started: elapsed,
    duration: 0.32 + Math.random() * 0.12,
  };
}
function updateLightning() {
  if (reduced.matches || !target.storm) {
    lightning = null;
    flash = 0;
    return;
  }
  if (scene.storm > 0.2 && elapsed >= lightningAt) {
    lightning = createLightning();
    lightningAt = elapsed + 5 + Math.random() * 9;
  }
  const age = lightning ? elapsed - lightning.started : Infinity;
  flash = lightning && age < lightning.duration ? Math.exp(-age * 10) : 0;
  if (!flash) lightning = null;
}
function drawLightning(t) {
  if (!lightning || reduced.matches || !target.storm) return;
  const opacity = Math.max(0, 1 - (t - lightning.started) / lightning.duration);
  if (!opacity) return;
  ctx.save();
  ctx.fillStyle = `rgba(235,242,255,${flash * 0.18})`;
  ctx.fillRect(0, 0, width, height);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowColor = `rgba(189,216,255,${opacity})`;
  ctx.shadowBlur = 16;
  const stroke = (path, lineWidth, alpha) => {
    ctx.strokeStyle = `rgba(240,247,255,${alpha})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    path.forEach(([x, y], index) =>
      index
        ? ctx.lineTo(x * width, y * height)
        : ctx.moveTo(x * width, y * height),
    );
    ctx.stroke();
  };
  stroke(lightning.path, 5, opacity * 0.28);
  stroke(lightning.path, 2, opacity);
  lightning.branches.forEach((branch) => stroke(branch, 1, opacity * 0.65));
  ctx.restore();
}
function animate(now) {
  frame = 0;
  if (document.hidden || reduced.matches) return;
  const interval = 1000 / (target.rain > 0.01 || scene.rain > 0.01 ? 60 : 30);
  if (now - lastFrame >= interval - 0.5) {
    const dt = Math.min(0.1, (now - (previousTime || now)) / 1000);
    previousTime = now;
    elapsed += dt;
    for (const key of Object.keys(scene))
      scene[key] += (target[key] - scene[key]) * Math.min(1, dt * 1.2);
    updatePrecipitation(dt);
    updateLightning();
    snowCover += (scene.snow - snowCover) * dt * 0.035;
    draw(elapsed);
    lastFrame = now - (Math.max(0, now - lastFrame - interval) % interval);
  }
  frame = requestAnimationFrame(animate);
}
function startAnimation() {
  cancelAnimationFrame(frame);
  frame = 0;
  previousTime = 0;
  if (reduced.matches) {
    lightning = null;
    flash = 0;
    lightningAt = Infinity;
    scene = { ...target };
    snowCover = target.snow;
    draw(elapsed);
  } else if (!document.hidden) {
    if (target.storm && !Number.isFinite(lightningAt))
      lightningAt = elapsed + 0.8 + Math.random() * 1.2;
    frame = requestAnimationFrame(animate);
  }
}
document.addEventListener("visibilitychange", () => {
  startAnimation();
  if (!document.hidden && state.loaded && Date.now() - state.loaded > 600000) loadWeather();
});
reduced.addEventListener("change", startAnimation);
$("language").addEventListener("change", (event) =>
  WeatherI18n.setLanguage(event.target.value),
);
document.addEventListener("weather:languagechange", () => {
  const scrollLeft = $("hour-scroll").scrollLeft;
  const previousStatus = lastStatus;
  const previousLive = $("live").textContent;
  if (state.data) {
    render();
    if (previousStatus?.error) $("live").textContent = t(previousLive);
  } else {
    for (const id of [
      "city",
      "region",
      "condition",
      "feels",
      "max",
      "min",
      "datetime",
      "live",
      "hours",
      "day-caption",
      "details-time",
    ]) {
      $(id).textContent = t($(id).textContent.trim());
    }
    $("days")
      .querySelectorAll(".empty")
      .forEach((el) => {
        el.textContent = t(el.textContent.trim());
      });
    renderMetrics({});
  }
  $("hour-scroll").scrollLeft = scrollLeft;
  if (previousStatus)
    status(previousStatus.message, previousStatus.error, previousStatus.retry);
  clearTimeout(searchTimer);
  searchController?.abort();
  closeSearch();
  if ($("search").value.trim().length >= 2)
    $("search").dispatchEvent(new Event("input"));
});
WeatherI18n.apply();
renderMetrics({});
resize();
startAnimation();
detectApproximateLocation();
