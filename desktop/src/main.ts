import { mount } from "svelte";
import App from "./App.svelte";
import "../../src/lib/css/pixel.scss";
import "./style.css";

mount(App, { target: document.getElementById("app")! });
