const React = require('react');
const { Html, Head, Body, Container, Section, Text, Heading } = require('@react-email/components');

const PaymentFailedEmail = ({ transactionData }) => {
  const { transaction_code } = transactionData;

  return React.createElement(Html, null,
    React.createElement(Head),
    React.createElement(Body, { style: main },
      React.createElement(Container, { style: container },
        React.createElement(Heading, { style: h1 }, 'Pago Rechazado'),
        React.createElement(Text, { style: text },
          'Tu pago no pudo ser procesado.'
        ),
        React.createElement(Section, { style: errorBox },
          React.createElement(Text, { style: infoText },
            React.createElement('strong', null, 'Código de operación: '),
            transaction_code
          )
        ),
        React.createElement(Text, { style: text },
          'Por favor, intenta con otro método de pago. Si el problema persiste, contacta con soporte.'
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

const errorBox = {
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

module.exports = PaymentFailedEmail;
