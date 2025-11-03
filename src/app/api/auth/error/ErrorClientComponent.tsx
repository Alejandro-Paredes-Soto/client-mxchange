"use client";

import { useSearchParams } from "next/navigation";

export default function ErrorClientComponent() {
  const searchParams = useSearchParams();
  const rawError = searchParams.get("error");
  let errorMessage = "Ha ocurrido un error inesperado.";
  try {
    const parsed = JSON.parse(rawError || "");

    errorMessage = parsed.message || parsed;
  } catch {
    // Si no es JSON, usamos el valor plano
    if (rawError) errorMessage = rawError;
  }

  return (
    <div
      style={{ maxWidth: "400px", margin: "20px auto" }}
      className="flex flex-col items-center bg-red-50 shadow-md p-4 border border-red-400 rounded-lg text-red-700"
    >
      <h2 className="mb-2 font-semibold text-xl">¡Error!</h2>
      <p className="mb-4 text-center">{errorMessage}</p>
      <a
        href="/login"
        className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded text-white transition-colors duration-200"
      >
        Volver a la pagina principal
      </a>
    </div>
  );
}