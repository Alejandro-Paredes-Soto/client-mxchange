const React = require('react');
const { Html, Head, Body, Container, Heading, Text, Section, Hr } = require('@react-email/components');

const containerStyle = {
  margin: '0 auto',
  padding: '20px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const h1 = {
  color: '#000000',
  fontSize: '24px',
  fontWeight: '600',
  margin: '40px 0 20px',
  padding: '0 0 16px 0',
  borderBottom: '1px solid #e5e7eb',
};

const paragraph = {
  color: '#000000',
  fontSize: '16px',
  lineHeight: '26px',
  margin: '20px 0',
};

const detailBox = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  margin: '20px 0',
  padding: '20px',
};

const alertBox = {
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  margin: '20px 0',
  padding: '20px',
};

const criticalBox = {
  backgroundColor: '#fee2e2',
  border: '2px solid #ef4444',
  margin: '20px 0',
  padding: '20px',
};

const detailText = {
  color: '#000000',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '4px 0',
};

const LowInventoryAlertEmail = ({ branchName, currency, currentAmount, threshold, alertLevel }) => {
  const isCritical = alertLevel === 'CRÍTICO';
  const boxStyle = isCritical ? criticalBox : alertBox;
  
  return React.createElement(
    Html,
    null,
    React.createElement(Head, null),
    React.createElement(
      Body,
      { style: { margin: 0, padding: 0, backgroundColor: '#ffffff' } },
      React.createElement(
        Container,
        { style: containerStyle },
        React.createElement(Heading, { style: h1 }, `⚠️ Alerta de Inventario ${alertLevel}`),
        React.createElement(
          Text,
          { style: paragraph },
          isCritical 
            ? `Se ha detectado un nivel CRÍTICO de inventario en una de las sucursales. Se requiere atención inmediata.`
            : `Se ha detectado un nivel bajo de inventario en una de las sucursales.`
        ),
        React.createElement(
          Section,
          { style: boxStyle },
          React.createElement(
            Text,
            { style: { ...detailText, fontWeight: '600', fontSize: '16px', color: isCritical ? '#dc2626' : '#ea580c' } },
            `${currency} - ${branchName}`
          ),
          React.createElement(Hr, { style: { margin: '12px 0', borderColor: '#e5e7eb' } }),
          React.createElement(
            Text,
            { style: detailText },
            React.createElement('strong', null, 'Inventario disponible:'),
            ` ${new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(currentAmount)}`
          ),
          React.createElement(
            Text,
            { style: detailText },
            React.createElement('strong', null, 'Umbral configurado:'),
            ` ${new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(threshold)}`
          ),
          React.createElement(
            Text,
            { style: { ...detailText, marginTop: '12px', color: isCritical ? '#dc2626' : '#ea580c', fontWeight: '600' } },
            isCritical 
              ? `⚠️ NIVEL CRÍTICO: El inventario está por debajo del 50% del umbral`
              : `⚠️ NIVEL BAJO: El inventario está por debajo del umbral configurado`
          )
        ),
        React.createElement(
          Section,
          { style: detailBox },
          React.createElement(
            Text,
            { style: { ...detailText, fontSize: '16px', fontWeight: '600' } },
            'Acciones recomendadas:'
          ),
          React.createElement(
            Text,
            { style: detailText },
            isCritical 
              ? '• Reabastecer la sucursal con URGENCIA'
              : '• Revisar el inventario y planificar reabastecimiento'
          ),
          React.createElement(
            Text,
            { style: detailText },
            '• Revisar las operaciones pendientes'
          ),
          React.createElement(
            Text,
            { style: detailText },
            '• Ajustar el umbral si es necesario'
          )
        ),
        React.createElement(
          Text,
          { style: paragraph },
          'Puedes gestionar el inventario desde el panel de administración.'
        )
      )
    )
  );
};

module.exports = LowInventoryAlertEmail;
