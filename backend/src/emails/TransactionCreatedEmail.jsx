const React = require('react');
const { Html, Head, Body, Container, Section, Text, Heading } = require('@react-email/components');

const TransactionCreatedEmail = ({ transactionData }) => {
  const { transaction_code, type, amount_to, amount_from, currency_to, currency_from, branch_name } = transactionData;
  
  const operationType = type === 'buy' ? 'COMPRA' : 'VENTA';
  const amount = type === 'buy' ? amount_to : amount_from;
  const currency = type === 'buy' ? currency_to : currency_from;

  return React.createElement(Html, null,
    React.createElement(Head),
    React.createElement(Body, { style: main },
      React.createElement(Container, { style: container },
        React.createElement(Heading, { style: h1 }, 'Operación Reservada'),
        React.createElement(Text, { style: text },
          'Tu operación de ',
          React.createElement('strong', null, operationType),
          ' ha sido creada correctamente.'
        ),
        React.createElement(Section, { style: infoBox },
          React.createElement(Text, { style: infoText },
            React.createElement('strong', null, 'Código de operación: '),
            transaction_code
          ),
          React.createElement(Text, { style: infoText },
            React.createElement('strong', null, 'Tipo: '),
            operationType
          ),
          React.createElement(Text, { style: infoText },
            React.createElement('strong', null, 'Monto: '),
            `$${Number(amount).toFixed(2)} ${currency}`
          ),
          React.createElement(Text, { style: infoText },
            React.createElement('strong', null, 'Sucursal: '),
            branch_name
          )
        ),
        React.createElement(Text, { style: text },
          'Guarda este código para consultar el estado de tu operación.'
        )
      )
    )
  );
};

const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '20px 0 48px',
  marginBottom: '64px',
  maxWidth: '600px',
};

const h1 = {
  color: '#000000',
  fontSize: '24px',
  fontWeight: '600',
  margin: '40px 0 20px',
  padding: '0 40px',
  borderBottom: '1px solid #e5e7eb',
  paddingBottom: '16px',
};

const text = {
  color: '#000000',
  fontSize: '16px',
  lineHeight: '26px',
  padding: '0 40px',
};

const infoBox = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5e7eb',
  margin: '20px 40px',
  padding: '20px',
};

const infoText = {
  color: '#000000',
  fontSize: '14px',
  lineHeight: '24px',
  margin: '4px 0',
};

module.exports = TransactionCreatedEmail;
