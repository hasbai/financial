import { mount } from "svelte";
import App from "./App.svelte";
import "./style.css";
mount(App, { target: document.getElementById("root")! });

import { trackMobileViewport } from "./lib/mobile-viewport";
import { registerPwa } from "./lib/pwa";
trackMobileViewport();
if (import.meta.env.PROD) registerPwa();
