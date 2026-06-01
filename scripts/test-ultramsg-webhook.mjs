const webhookUrl = process.env.WEBHOOK_URL || "http://localhost:3030/api/webhook";

const payload = {
  event_type: "message_received",
  instanceId: "instance177604",
  data: {
    id: process.env.WEBHOOK_TEST_ID || `test-message-${Date.now()}`,
    from: "573001330213@c.us",
    to: "573001330213@c.us",
    body: "Hola, necesito informacion de la alcaldia",
    type: "chat",
    fromMe: false,
    time: 1710000000,
  },
};

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();

console.log("Webhook URL:", webhookUrl);
console.log("Status:", response.status);
console.log("Response:", text);
