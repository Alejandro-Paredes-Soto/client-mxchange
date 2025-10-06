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
      className="bg-red-50 border border-red-400 text-red-700 rounded-lg shadow-md  flex flex-col items-center p-4"
    >
      <h2 className="text-xl font-semibold mb-2">¡Error!</h2>
      <p className="mb-4 text-center">{errorMessage}</p>
      <a
        href="/principal"
        className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors duration-200"
      >
        Volver a la pagina principal
      </a>
    </div>
  );
}