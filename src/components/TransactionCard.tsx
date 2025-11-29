import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getStatusColor } from '@/lib/statuses';

interface TransactionCardProps {
  id: string;
  type: 'buy' | 'sell';
  amountFrom: number;
  amountTo: number;
  rate: number;
  commissionPercent?: number;
  commissionAmount?: number;
  method?: string;
  branch?: string;
  status: string;
  createdAt: number;
  showQR?: boolean;
  onDownloadQR?: (id: string) => void;
}

const humanizeType = (t: 'buy' | 'sell') => (t === 'buy' ? 'Compra de Dólares' : 'Venta de Dólares');
const formatAmount = (n: number) => Number(n).toFixed(2);

const humanizeMethod = (m?: string) => {
  if (!m) return 'N/A';
  const v = m.toLowerCase();
  if (v.includes('tarjeta') || v.includes('card')) return 'Tarjeta';
  if (v.includes('vent') || v.includes('cash') || v.includes('efectivo') || v.includes('sucursal')) return 'Ventanilla';
  return m;
};

export const TransactionCard: React.FC<TransactionCardProps> = ({
  id,
  type,
  amountFrom,
  amountTo,
  rate,
  commissionPercent,
  commissionAmount,
  method,
  branch,
  status,
  createdAt,
  showQR = false,
  onDownloadQR,
}) => {
  const [downloading, setDownloading] = useState(false);
  const isBuying = type === 'buy';
  const fromCurrency = isBuying ? 'MXN' : 'USD';
  const toCurrency = isBuying ? 'USD' : 'MXN';
  const fromLabel = isBuying ? 'Pagas' : 'Entregas';
  const toLabel = 'Recibes';
  const rateLabel = isBuying ? 'Tasa de Venta' : 'Tasa de Compra';
  const methodLabel = humanizeMethod(method);

  const sLower = (status || '').toLowerCase();
  const isPaid = sLower.includes('paid') || sLower.includes('pagado');

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-4">
        <div className="flex sm:flex-row flex-col justify-between items-start gap-4">
          <div className="flex-1">
            <h3 className="mb-1 font-bold text-xl">{humanizeType(type)}</h3>
            <p className="text-muted-foreground text-sm">
              {new Date(createdAt).toLocaleDateString('es-MX', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          <Badge className={getStatusColor(status)} variant="outline">
            {status}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Montos Principales */}
        <div className="bg-muted/50 p-6 rounded-lg">
          <div className="flex sm:flex-row flex-col justify-between items-center gap-6">
            <div className="flex-1 sm:text-left text-center">
              <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {fromLabel}
              </p>
              <p className="mb-1 font-bold text-3xl">
                ${formatAmount(amountFrom)}
              </p>
              <p className="font-semibold text-muted-foreground text-base">
                {fromCurrency}
              </p>
            </div>

            <div className="text-muted-foreground text-2xl">→</div>

            <div className="flex-1 text-center sm:text-right">
              <p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                {toLabel}
              </p>
              <p className="mb-1 font-bold text-3xl">
                ${formatAmount(amountTo)}
              </p>
              <p className="font-semibold text-muted-foreground text-base">
                {toCurrency}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Detalles de la Transacción */}
        <div className="gap-4 grid grid-cols-2">
          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Sucursal
            </p>
            <p className="font-semibold text-sm">{branch || 'N/D'}</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Método
            </p>
            <p className="font-semibold text-sm">{methodLabel}</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {rateLabel}
            </p>
            <p className="font-semibold text-sm">{Number(rate).toFixed(4)} MXN</p>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Comisión
            </p>
            <p className="font-semibold text-sm">
              {commissionPercent 
                ? `${commissionPercent.toFixed(2)}% ($${commissionAmount?.toFixed(2)} MXN)` 
                : '—'}
            </p>
          </div>

          <div className="space-y-1 col-span-2">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Folio
            </p>
            <p className="font-mono font-semibold text-sm truncate">{id}</p>
          </div>
        </div>

        {/* Mensaje de pago confirmado */}
        {isPaid && (
          <>
            <Separator />
            <div className="bg-muted/50 p-4 border rounded-md">
              <p className="text-sm">
                Gracias por tu pago. Hemos enviado tu solicitud a la sucursal. Por favor, espera a que nuestro personal prepare tu dinero. El estado cambiará a &quot;Listo para Recoger&quot; cuando puedas pasar por él.
              </p>
            </div>
          </>
        )}

        {/* Código QR */}
        {showQR && id && (
          <>
            <Separator />
            <div className="bg-muted/50 p-4 border rounded-md">
              <div className="flex sm:flex-row flex-col items-center gap-4">
                <div className="flex-shrink-0">
                  <Image
                    className="border-2 rounded-lg"
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(id)}`}
                    alt={`QR ${id}`}
                    width={120}
                    height={120}
                  />
                </div>
                <div className="flex-1 space-y-2 sm:text-left text-center">
                  <p className="font-semibold text-sm">
                    Presenta este código QR en sucursal
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Escanea este código en la sucursal para completar tu transacción
                  </p>
                  {onDownloadQR && (
                    <Button
                      onClick={async () => {
                        if (!onDownloadQR) return;
                        try {
                          setDownloading(true);
                          await Promise.resolve(onDownloadQR(id));
                        } catch (error) {
                          console.error('Error descargando QR desde TransactionCard:', error);
                          toast.error('Error al descargar el QR');
                        } finally {
                          setDownloading(false);
                        }
                      }}
                      disabled={downloading}
                      variant="default"
                      size="sm"
                      className="mt-2 cursor-pointer"
                    >
                      {downloading ? (
                        <>
                          <Spinner className="mr-2 w-4 h-4" />
                          Descargando...
                        </>
                      ) : (
                        'Descargar QR'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Botón Ver más */}
        <div className="pt-2">
          <Link href={`/operacion/confirm?txId=${id}`} className="w-full">
            <Button variant="default" className="w-full cursor-pointer">
              Ver detalles completos
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};
