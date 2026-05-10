// Configure @monaco-editor/react to load Monaco directly from a CDN.
// This avoids webpack chunk-loading errors in CRA dev mode (the
// "url.startsWith is not a function" runtime overlay error).
import { loader } from "@monaco-editor/react";

loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs",
  },
});

export default loader;
