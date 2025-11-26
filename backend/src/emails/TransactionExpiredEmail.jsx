import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
  Link
} from '@react-email/components';
import * as React from 'react';

export const TransactionExpiredEmail = ({ 
  name = 'Cliente',
  transaction_code = 'MXXXXXABC',
  type = 'sell',
  amount_to,
  currency_to,
  branch_name = 'MXChange',
  expired_at
}) => {
  const isSell = type === 'sell';
  const operationType = isSell ? 'Venta de dólares' : 'Compra de dólares';
  
  return (
    <Html>
      <Head />
      <Preview>Tu reserva {transaction_code} ha expirado</Preview>
      <Body style={main}>
        <Container style={container}>
          <div style={{ marginBottom: '16px', textAlign: 'center' }}>
            <h1 style={{ fontWeight: 'bold', fontSize: '36px', color: '#064' }}>
              M<span style={{ fontSize: '48px', color: '#00a86b' }}>X</span>ange
            </h1>
            <p style={{ marginTop: '8px', fontWeight: '300', color: '#666', fontSize: '14px' }}>Compra y vende divisas al mejor precio</p>
          </div>
          <Heading style={h1}>⏰ Reserva Expirada</Heading>
          
          <Text style={text}>Hola {name},</Text>
          
          <Text style={text}>
            Lamentamos informarte que tu reserva ha expirado por falta de asistencia 
            en el tiempo establecido.
          </Text>

          <Section style={codeBox}>
            <Text style={codeText}>Código: {transaction_code}</Text>
          </Section>

          <Section style={detailsSection}>
            <Heading as="h2" style={h2}>
              Detalles de la reserva expirada
            </Heading>
            
            <Text style={detailItem}>
              <strong>Tipo de operación:</strong> {operationType}
            </Text>
            
            <Text style={detailItem}>
              <strong>Monto:</strong> ${amount_to} {currency_to}
            </Text>
            
            <Text style={detailItem}>
              <strong>Sucursal:</strong> {branch_name}
            </Text>
            
            {expired_at && (
              <Text style={detailItem}>
                <strong>Fecha de expiración:</strong> {new Date(expired_at).toLocaleString('es-MX')}
              </Text>
            )}
          </Section>

          <Hr style={hr} />

          <Section style={infoBox}>
            <Text style={infoText}>
              <strong>¿Qué significa esto?</strong>
            </Text>
            <Text style={infoText}>
              {isSell ? (
                <>
                  Los dólares que habías reservado han sido liberados y están 
                  nuevamente disponibles para otros clientes. Si aún deseas 
                  realizar esta operación, por favor genera una nueva reserva.
                </>
              ) : (
                <>
                  La reserva de dólares que realizaste ha expirado. Si aún 
                  deseas comprar dólares, por favor genera una nueva orden.
                </>
              )}
            </Text>
          </Section>

          <Section style={actionSection}>
            <Text style={text}>
              Para realizar una nueva operación, ingresa a tu cuenta:
            </Text>
            <Link
              href={process.env.FRONTEND_URL || 'http://localhost:3000'}
              style={button}
            >
              Ir a MXChange
            </Link>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            Este es un correo automático del sistema MXChange.
            <br />
            Si tienes dudas, por favor contacta a tu sucursal.
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export default TransactionExpiredEmail;

// Estilos
const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const h1 = {
  color: '#1a1a1a',
  fontSize: '32px',
  fontWeight: 'bold',
  margin: '40px 0',
  padding: '0 40px',
  textAlign: 'center',
};

const h2 = {
  color: '#1a1a1a',
  fontSize: '20px',
  fontWeight: 'bold',
  margin: '20px 0 10px',
};

const text = {
  color: '#404040',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '16px 0',
  padding: '0 40px',
};

const codeBox = {
  background: '#fef3c7',
  border: '2px solid #f59e0b',
  borderRadius: '8px',
  margin: '24px 40px',
  padding: '20px',
  textAlign: 'center',
};

const codeText = {
  color: '#92400e',
  fontSize: '24px',
  fontWeight: 'bold',
  margin: '0',
  letterSpacing: '2px',
};

const detailsSection = {
  backgroundColor: '#f9fafb',
  borderRadius: '8px',
  margin: '24px 40px',
  padding: '24px',
};

const detailItem = {
  color: '#404040',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '8px 0',
};

const infoBox = {
  backgroundColor: '#eff6ff',
  borderLeft: '4px solid #3b82f6',
  borderRadius: '4px',
  margin: '24px 40px',
  padding: '16px 20px',
};

const infoText = {
  color: '#1e40af',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '8px 0',
};

const actionSection = {
  margin: '32px 0',
  textAlign: 'center',
};

const button = {
  backgroundColor: '#059669',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center',
  display: 'inline-block',
  padding: '12px 32px',
  margin: '16px 0',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 40px',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
  padding: '0 40px',
  textAlign: 'center',
};
