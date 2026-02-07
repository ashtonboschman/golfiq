import { callOpenAI } from "../openai";

type MockResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<any>;
};

describe("callOpenAI", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  function mockFetch(response: MockResponse) {
    global.fetch = jest.fn().mockResolvedValue(response as any);
  }

  it("uses Responses API with medium verbosity for non-gpt5 models", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        model: "gpt-4o-mini",
        output_text: '{"messages":["a","b","c"]}',
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      }),
    });

    const result = await callOpenAI({
      apiKey: "test",
      model: "gpt-4o-mini",
      systemPrompt: "sys",
      userPrompt: "usr",
      maxOutputTokens: 300,
      timeoutMs: 5000,
    });

    expect(result.text).toBe('{"messages":["a","b","c"]}');
    expect(result.usage?.endpoint).toBe("responses");
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.text.verbosity).toBe("medium");
    expect(body.reasoning).toBeUndefined();
  });

  it("uses low verbosity + minimal reasoning for gpt-5 models", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        model: "gpt-5-nano",
        output_text: '{"messages":["a","b","c"]}',
        usage: { input_tokens: 8, output_tokens: 9, total_tokens: 17 },
      }),
    });

    await callOpenAI({
      apiKey: "test",
      model: "gpt-5-nano",
      systemPrompt: "sys",
      userPrompt: "usr",
      maxOutputTokens: 250,
      timeoutMs: 5000,
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.text.verbosity).toBe("low");
    expect(body.reasoning).toEqual({ effort: "minimal" });
  });

  it("extracts text from output content parts when output_text is absent", async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        model: "gpt-4o-mini",
        output: [
          {
            content: [{ text: "  first  " }, { text: "second" }],
          },
        ],
      }),
    });

    const result = await callOpenAI({
      apiKey: "test",
      model: "gpt-4o-mini",
      systemPrompt: "sys",
      userPrompt: "usr",
      maxOutputTokens: 300,
      timeoutMs: 5000,
    });

    expect(result.text).toBe("first\nsecond");
  });

  it("throws API error details for non-ok responses", async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "bad request" } }),
    });

    await expect(
      callOpenAI({
        apiKey: "test",
        model: "gpt-4o-mini",
        systemPrompt: "sys",
        userPrompt: "usr",
        maxOutputTokens: 300,
        timeoutMs: 5000,
      })
    ).rejects.toThrow("OpenAI Responses API error (status 400): bad request");
  });

  it("throws when API returns no text content", async () => {
    mockFetch({
      ok: true,
      json: async () => ({ model: "gpt-4o-mini", output: [] }),
    });

    await expect(
      callOpenAI({
        apiKey: "test",
        model: "gpt-4o-mini",
        systemPrompt: "sys",
        userPrompt: "usr",
        maxOutputTokens: 300,
        timeoutMs: 5000,
      })
    ).rejects.toThrow("OpenAI returned no content");
  });

  it("returns a timeout error on abort", async () => {
    jest.useFakeTimers();

    global.fetch = jest.fn().mockImplementation((_url, init: any) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const err: any = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });

    const promise = callOpenAI({
      apiKey: "test",
      model: "gpt-4o-mini",
      systemPrompt: "sys",
      userPrompt: "usr",
      maxOutputTokens: 300,
      timeoutMs: 100,
    });

    jest.advanceTimersByTime(120);
    await expect(promise).rejects.toThrow("OpenAI request timed out");
  });
});

