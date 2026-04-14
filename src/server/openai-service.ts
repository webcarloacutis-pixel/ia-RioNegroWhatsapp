import OpenAI from "openai";

const globalForOpenAI = globalThis as unknown as {
  __rionegroOpenAIClient?: OpenAI | null;
};

export function isOpenAIConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAIModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
}

function getClient() {
  if (!isOpenAIConfigured()) {
    return null;
  }

  if (!globalForOpenAI.__rionegroOpenAIClient) {
    globalForOpenAI.__rionegroOpenAIClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return globalForOpenAI.__rionegroOpenAIClient;
}

export async function generateOpenAIText(input: {
  systemPrompt: string;
  userPrompt: string;
}) {
  const client = getClient();

  if (!client) {
    return null;
  }

  const response = await client.responses.create({
    model: getOpenAIModel(),
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: input.systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: input.userPrompt }],
      },
    ],
  });

  return response.output_text.trim();
}
