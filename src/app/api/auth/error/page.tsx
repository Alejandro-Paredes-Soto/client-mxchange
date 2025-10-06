import ErrorClientComponent from "./ErrorClientComponent";

export const dynamic = "force-dynamic"; // para evitar prerender

export default function AuthErrorPage() {
  return <ErrorClientComponent />;
}