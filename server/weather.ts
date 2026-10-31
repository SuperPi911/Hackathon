import { z } from "zod";
import { TRPCError } from "@trpc/server";

const forecastSchema = z.object({
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number().nullable()),
    wind_speed_10m: z.array(z.number().nullable()),
    wind_gusts_10m: z.array(z.number().nullable()),
    precipitation_probability: z.array(z.number().nullable()),
    precipitation: z.array(z.number().nullable()),
    visibility: z.array(z.number().nullable()),
    weather_code: z.array(z.number().nullable()),
    is_day: z.array(z.number().nullable())
  })
});

const weatherDescriptions: Record<number, string> = {
  0: "Senin",
  1: "Predominant senin",
  2: "Parțial noros",
  3: "Noros",
  45: "Ceață",
  48: "Ceață cu depuneri de chiciură",
  51: "Burniță ușoară",
  53: "Burniță moderată",
  55: "Burniță densă",
  61: "Ploaie ușoară",
  63: "Ploaie moderată",
  65: "Ploaie puternică",
  71: "Ninsoare ușoară",
  73: "Ninsoare moderată",
  75: "Ninsoare puternică",
  80: "Averse ușoare",
  81: "Averse moderate",
  82: "Averse puternice",
  85: "Averse de ninsoare ușoare",
  86: "Averse de ninsoare puternice",
  95: "Furtună",
  96: "Furtună cu grindină ușoară",
  99: "Furtună cu grindină puternică"
};

export async function getHourlyWeather(input: {
  latitude: number;
  longitude: number;
  date: string;
  time: string;
}) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(input.latitude),
    longitude: String(input.longitude),
    hourly: [
      "temperature_2m",
      "wind_speed_10m",
      "wind_gusts_10m",
      "precipitation_probability",
      "precipitation",
      "visibility",
      "weather_code",
      "is_day"
    ].join(","),
    forecast_days: "16",
    timezone: "auto"
  }).toString();

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Serviciul meteo nu este disponibil acum." });
  }
  if (!response.ok) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `Serviciul meteo a răspuns cu eroarea ${response.status}.` });
  }

  const parsed = forecastSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "Răspunsul serviciului meteo nu are formatul așteptat." });
  }

  const targetHour = Number(input.time.slice(0, 2));
  const hourly = parsed.data.hourly;
  const index = hourly.time.findIndex((value) => value.startsWith(`${input.date}T${String(targetHour).padStart(2, "0")}:`));
  if (index < 0) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Nu există prognoză pentru data și ora selectate. Alege un interval din următoarele 16 zile." });
  }

  const code = hourly.weather_code[index];
  const windKmh = hourly.wind_speed_10m[index];
  const gustKmh = hourly.wind_gusts_10m[index];
  const precipitationProbability = hourly.precipitation_probability[index];
  const precipitationMm = hourly.precipitation[index];
  const visibilityMeters = hourly.visibility[index];
  const isDay = hourly.is_day[index] === 1;
  const reasons: string[] = [];
  let stopFlight = false;

  if (!isDay) {
    stopFlight = true;
    reasons.push("Este noapte la ora selectată; nu zbura.");
  }
  if (code === 45 || code === 48 || (visibilityMeters !== null && visibilityMeters < 1000)) {
    stopFlight = true;
    reasons.push("Ceața sau vizibilitatea sub 1 km: nu zbura.");
  }
  if (code !== null && (code >= 51 || code >= 45 && code <= 48)) {
    reasons.push(`Condiții meteo nefavorabile: ${weatherDescriptions[code] || "precipitații sau fenomene meteo"}.`);
  }
  if (precipitationProbability !== null && precipitationProbability >= 50) {
    reasons.push(`Probabilitate ridicată de precipitații (${precipitationProbability}%).`);
  }
  if (precipitationMm !== null && precipitationMm > 0) {
    reasons.push("Este prognozată precipitație în intervalul selectat.");
  }
  if (windKmh !== null && windKmh >= 25) reasons.push(`Vântul prognozat este puternic (${Math.round(windKmh)} km/h).`);
  if (gustKmh !== null && gustKmh >= 35) reasons.push(`Rafalele prognozate sunt puternice (${Math.round(gustKmh)} km/h).`);
  if (code === null || windKmh === null || gustKmh === null || precipitationProbability === null
    || precipitationMm === null || visibilityMeters === null || hourly.is_day[index] === null) {
    reasons.push("Lipsesc unele măsurători meteo pentru acest interval; condițiile nu pot fi recomandate.");
  }

  return {
    source: "Open-Meteo",
    sourceUrl: "https://open-meteo.com/",
    time: hourly.time[index],
    temperatureC: hourly.temperature_2m[index],
    windKmh,
    gustKmh,
    precipitationProbability,
    precipitationMm,
    visibilityMeters,
    weatherCode: code,
    description: code === null ? "Condiții necunoscute" : weatherDescriptions[code] || "Condiții schimbătoare",
    isDay,
    stopFlight,
    recommendFlight: reasons.length === 0,
    reasons
  };
}
