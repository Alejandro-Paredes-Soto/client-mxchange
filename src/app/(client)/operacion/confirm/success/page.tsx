"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, Clock, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@radix-ui/react-separator';
import { Button } from '@/components/ui/button';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

// Función para humanizar estados
const humanizeStatus = (status: string): string => {
  const statusMap: { [key: string]: string } = {
    'reserved': 'Reservado',
    'processing': 'Procesando',
    'paid': 'Pagado',
    'ready_for_pickup': 'Listo para recoger',
    'ready_to_receive': 'Listo para recibir',
    'completed': 'Completado',
    'cancelled': 'Cancelado',
    'expired': 'Expirado',
    'pending': 'Pendiente',
    'failed': 'Fallido'
  };
  return statusMap[status] || status;
};

export default function SuccessPage() {
  const params = useSearchParams();
  const router = useRouter();
  const txCode = params.get('txId');
  const [status, setStatus] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!txCode) return;
    let mounted = true;
    let tries = 0;
    const doFetch = async () => {
      try {
        const res = await fetch(`${API_BASE}/payments/status/${encodeURIComponent(txCode)}`);
        if (!mounted) return;
        if (!res.ok) { setStatus({ error: 'No se pudo obtener estado' }); return; }
        const j = await res.json();
        setStatus(j);
        tries += 1;
        // si no está finalizado, seguir polling hasta 20 intentos (~60s)
        const txStatus = j && j.transaction && j.transaction.status ? j.transaction.status : null;
        // Estados finales que detienen el polling
        const finalStates = ['paid', 'completed', 'ready_for_pickup', 'ready_to_receive', 'cancelled', 'failed', 'expired'];
        if (txStatus && !finalStates.includes(txStatus) && tries < 20) {
          setPolling(true);
          setTimeout(doFetch, 3000);
        } else {
          setPolling(false);
        }
      } catch {
        if (!mounted) return;
        setStatus({ error: 'Error de red' });
        setPolling(false);
      }
    };
    doFetch();
    return () => { mounted = false; };
  }, [txCode]);

  const getStatusBadge = (txStatus: string) => {
    const humanStatus = humanizeStatus(txStatus);
    
    switch (txStatus) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600">
            <CheckCircle2 className="mr-1 w-3 h-3" />
            {humanStatus}
          </Badge>
        );
      case 'paid':
        return (
          <Badge variant="default" className="bg-green-500 hover:bg-green-600">
            <CheckCircle2 className="mr-1 w-3 h-3" />
            {humanStatus}
          </Badge>
        );
      case 'processing':
        return (
          <Badge variant="secondary" className="bg-blue-500 hover:bg-blue-600 text-white">
            <Clock className="mr-1 w-3 h-3" />
            {humanStatus}
          </Badge>
        );
      case 'pending':
      case 'reserved':
        return (
          <Badge variant="secondary">
            <Clock className="mr-1 w-3 h-3" />
            {humanStatus}
          </Badge>
        );
      case 'failed':
      case 'cancelled':
      case 'expired':
        return (
          <Badge variant="destructive">
            <XCircle className="mr-1 w-3 h-3" />
            {humanStatus}
          </Badge>
        );
      case 'ready_for_pickup':
      case 'ready_to_receive':
        return (
          <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">
            <CheckCircle2 className="mr-1 w-3 h-3" />
            {humanStatus}
          </Badge>
        );
      default:
        return <Badge variant="outline">{humanStatus}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="mx-auto px-4 py-8 max-w-4xl container">
      <div className="mb-8">
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push(`/operacion/confirm?txId=${encodeURIComponent(txCode || '')}`)}
        >
          <ArrowLeft className="mr-2 w-4 h-4" />
          Volver a detalles de la transacción
        </Button>
        <div className="flex items-center gap-3 mb-2">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
          <h1 className="font-bold text-3xl tracking-tight">Pago Recibido</h1>
        </div>
        <p className="text-muted-foreground">
          Tu transacción ha sido procesada exitosamente
        </p>
      </div>

      {/* Estado de carga */}
      {!status && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col justify-center items-center space-y-4 text-center">
              <Loader2 className="w-12 h-12 text-primary animate-spin" />
              <p className="font-medium text-lg">Consultando estado de la transacción...</p>
              <p className="text-muted-foreground text-sm">Por favor espera un momento</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {status && status.error && (
        <Card className="border-destructive">
          <CardContent className="py-12">
            <div className="flex flex-col justify-center items-center space-y-4 text-center">
              <XCircle className="w-12 h-12 text-destructive" />
              <p className="font-medium text-destructive text-lg">Error al consultar el estado</p>
              <p className="text-muted-foreground text-sm">{status.error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Información de la transacción */}
      {status && !status.error && status.transaction && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Detalles de la Transacción</CardTitle>
              <CardDescription>
                Información sobre tu pago procesado
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="gap-4 grid grid-cols-1 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">ID de Transacción</p>
                  <p className="font-mono font-medium">{status.transaction.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Estado</p>
                  <div>
                    {getStatusBadge(status.transaction.status)}
                  </div>
                </div>
              </div>

              {polling && (
                <div className="flex items-center gap-2 bg-muted p-3 rounded-md">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <p className="text-sm">Actualizando estado...</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pagos relacionados */}
          {status.payments && status.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Pagos Relacionados</CardTitle>
                <CardDescription>
                  Historial de pagos asociados a esta transacción
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {status.payments.map((p: any, index: number) => (
                    <React.Fragment key={p.id}>
                      {index > 0 && <Separator />}
                      <div className="flex sm:flex-row flex-col justify-between sm:items-center gap-3 hover:bg-accent/50 p-3 rounded-lg transition-colors">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">
                              {p.amount} {p.currency}
                            </p>
                            {getStatusBadge(p.status)}
                          </div>
                          <p className="text-muted-foreground text-sm">
                            {formatDate(p.created_at)}
                          </p>
                        </div>
                        <div className="font-mono text-muted-foreground text-sm">
                          ID: {p.id}
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Información adicional */}
          <Card className="bg-muted/50">
            <CardContent className="py-6">
              <p className="text-muted-foreground text-sm text-center">
                Si tienes alguna pregunta sobre esta transacción, por favor contacta a nuestro equipo de soporte con el ID de transacción proporcionado.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}