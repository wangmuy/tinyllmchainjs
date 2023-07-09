# tiny LangChain.js

## What is this?
This is an excerpt from [LangChain.js 0.0.101](https://github.com/hwchase17/langchainjs/tree/0.0.101), including only the core components, so that a mrkl chain can be run on the single bundle.

## Why I do this?
Becase I am a newbie to web frontend development. So I copied only the core components and try to bundle them into a single bundle.js so that it can be run on browser.

Besides, a tiny core excerpt from LangChain.js may be run on a smaller/embedded js environment, like
* [cef](https://github.com/chromiumembedded/cef)
* [NativeScript](https://github.com/NativeScript/NativeScript)
* [neutralinojs](https://github.com/neutralinojs/neutralinojs)
* [txiki.js](https://github.com/saghul/txiki.js)
* [krane](https://github.com/openkraken/kraken)
Ultimately on IoT devices...

## Quickstart
```bash
yarn bundle
yarn http-server
# visit http://127.0.0.1:8080 and look for the console log
```