// Installs CSP-safe shader polyfills; it does not enable unsafe-eval.
import "pixi.js/unsafe-eval";
import { Application, Assets, Container, Graphics, Sprite, Text } from "pixi.js";

export const pixiRuntime = {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
};

export type PixiRuntimeModule = typeof pixiRuntime;