import { useEffect } from "react";
import type { AppProps } from "next/app";
import Head from "next/head";
import "../styles/globals.css";
import { registerServiceWorker } from "../lib/pwa";

export default function App({ Component, pageProps }: AppProps) {
  // SSR-safe: registerServiceWorker no-ops on the server and outside production.
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  return (
    <>
      <Head>
        <link rel="icon" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0C0A12" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
