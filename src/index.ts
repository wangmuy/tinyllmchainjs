import { OpenAI } from "./llms/openai.js";
// import { HttpsProxyAgent } from "https-proxy-agent";

const OPENAI_API_KEY = "sk-";

// https://github.com/openai/openai-node/issues/85
// https://github.com/hwchase17/langchainjs/issues/1454
// const proxy = new HttpsProxyAgent("http://127.0.0.1:1091")
export const run = async () => {
  const model = new OpenAI(
    {openAIApiKey: OPENAI_API_KEY, temperature: 0.9},
    {
    //   baseOptions: {proxy: false, httpAgent: proxy, httpsAgent: proxy}
    }
  );
  const res = await model.call("What would be a good company name a company that makes colorful socks?")
  console.log({res})
};

run();