"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import { getStripeConfig, stripeCharge } from "@/app/services/api";

type Props = {
  amount: number; // en MXN
  currency?: string; // default MXN
  description?: string;
  transaction_code: string;
  customer: { name: string; email: string };
  token?: string; // JWT del usuario autenticado
  onSuccess?: (data: any) => void;
  onError?: (err: any) => void;
};

function CheckoutInner({ amount, currency = "MXN", description, transaction_code, customer, token, onSuccess, onError }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Función para traducir errores de Stripe al español
  const translateStripeError = (errorMessage: string): string => {
    const errorTranslations: { [key: string]: string } = {
      'Your card number is incomplete.': 'El número de tarjeta está incompleto.',
      'Your card\'s expiration date is incomplete.': 'La fecha de vencimiento está incompleta.',
      'Your card\'s security code is incomplete.': 'El código de seguridad está incompleto.',
      'Your card number is invalid.': 'El número de tarjeta es inválido.',
      'Your card has expired.': 'Tu tarjeta ha expirado.',
      'Your card\'s security code is invalid.': 'El código de seguridad es inválido.',
      'Your card was declined.': 'Tu tarjeta fue rechazada.',
      'Your card has insufficient funds.': 'Tu tarjeta tiene fondos insuficientes.',
      'An error occurred while processing your card.': 'Ocurrió un error al procesar tu tarjeta.',
      'Your card does not support this type of purchase.': 'Tu tarjeta no soporta este tipo de compra.',
      'card_declined': 'Tarjeta rechazada. Por favor, intenta con otra tarjeta.',
      'insufficient_funds': 'Fondos insuficientes en la tarjeta.',
      'lost_card': 'La tarjeta fue reportada como perdida.',
      'stolen_card': 'La tarjeta fue reportada como robada.',
      'expired_card': 'La tarjeta ha expirado.',
      'incorrect_cvc': 'El código de seguridad (CVC) es incorrecto.',
      'processing_error': 'Error al procesar el pago. Por favor, intenta nuevamente.',
      'incorrect_number': 'El número de tarjeta es incorrecto.',
      'invalid_expiry_year': 'El año de vencimiento es inválido.',
      'invalid_expiry_month': 'El mes de vencimiento es inválido.',
      'No se pudo crear el método de pago': 'No se pudo crear el método de pago. Verifica los datos de tu tarjeta.',
      'Error procesando el pago': 'Error al procesar el pago. Por favor, verifica los datos e intenta nuevamente.',
      'Solo se aceptan tarjetas de débito o prepagadas': '❌ Solo se aceptan tarjetas de débito o prepagadas',
      'Por políticas de la plataforma, no aceptamos tarjetas de crédito': 'Por políticas de la plataforma, no aceptamos tarjetas de crédito. Por favor, utiliza una tarjeta de débito.',
    };

    // Buscar traducciones exactas
    if (errorTranslations[errorMessage]) {
      return errorTranslations[errorMessage];
    }

    // Buscar traducciones parciales
    for (const [key, value] of Object.entries(errorTranslations)) {
      if (errorMessage.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }

    return errorMessage;
  };

  const handlePay = useCallback(async () => {
    setError(null);
    if (!stripe || !elements) return;
    setLoading(true);
    try {
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("No se encontró el elemento de tarjeta");

      const pm = await stripe.createPaymentMethod({
        type: "card",
        card,
        billing_details: { name: customer.name, email: customer.email },
      });
      if (pm.error || !pm.paymentMethod) {
        const errorMsg = pm.error?.message || "No se pudo crear el método de pago";
        throw new Error(translateStripeError(errorMsg));
      }

      const resp = await stripeCharge(
        {
          amount,
          currency,
          description,
          transaction_code,
          customer,
          payment_method_id: pm.paymentMethod.id,
        },
        token
      );
      
      // Verificar si hay error en la respuesta
      if ((resp as any).error) {
        const errorData = (resp as any).error;
        const errorMsg = errorData.details || errorData.message || "Error procesando el pago";
        throw new Error(translateStripeError(errorMsg));
      }

      // Si el pago fue exitoso, llamar onSuccess inmediatamente
      // El backend ya actualizó el estado a 'paid'
      onSuccess?.(resp);
    } catch (e: any) {
      console.error('Error detallado del pago:', e);
      
      // Extraer mensaje de error más detallado
      let errorMsg = "Error procesando el pago";
      
      // Verificar si es el error específico de tarjeta de crédito no permitida
      if (e?.response?.data?.error?.code === 'card_type_not_allowed') {
        errorMsg = e.response.data.details || e.response.data.message || "Solo se aceptan tarjetas de débito o prepagadas";
      }
      // Primero intentar obtener el mensaje del error
      else if (e?.message && e.message !== "Error procesando el pago") {
        errorMsg = e.message;
      } else if (e?.error?.details) {
        errorMsg = e.error.details;
      } else if (e?.error?.message) {
        errorMsg = e.error.message;
      } else if (e?.response?.data?.details) {
        errorMsg = e.response.data.details;
      } else if (e?.response?.data?.message) {
        errorMsg = e.response.data.message;
      }
      
      // Traducir el error
      const translatedError = translateStripeError(errorMsg);
      setError(translatedError);
      onError?.(e);
    } finally {
      setLoading(false);
    }
  }, [stripe, elements, amount, currency, description, transaction_code, customer, token, onSuccess, onError]);

  return (
    <div className="space-y-3">
      <div className="p-3 border rounded-md">
        <CardElement options={{ hidePostalCode: true }} />
      </div>
      {error && (
        <div className="bg-red-50 p-4 border border-red-200 rounded-md">
          <div className="flex items-start gap-2">
            <svg className="flex-shrink-0 mt-0.5 w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h3 className="font-medium text-red-800 text-sm">Error en el pago</h3>
              <p className="mt-1 text-red-700 text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        disabled={!stripe || loading}
        onClick={handlePay}
        className="inline-flex justify-center items-center bg-black hover:opacity-90 disabled:opacity-50 px-4 py-2 rounded-md w-full font-medium text-white transition-opacity"
      >
        {loading ? "Procesando…" : "Pagar"}
      </button>
    </div>
  );
}

export default function StripeCheckout(props: Props) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getStripeConfig();
        if (!cfg?.publicKey) {
          setErr("Stripe no está configurado");
          return;
        }
        setStripePromise(loadStripe(cfg.publicKey));
        setReady(true);
      } catch (e) {
        console.error(e);
        setErr("No se pudo cargar la configuración de pagos");
      }
    })();
  }, []);

  if (err) return <p className="text-red-600 text-sm">{err}</p>;
  if (!ready || !stripePromise) return <p>Cargando pago…</p>;

  return (
    <Elements stripe={stripePromise}>
      <CheckoutInner {...props} />
    </Elements>
  );
}
