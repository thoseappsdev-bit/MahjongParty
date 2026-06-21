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