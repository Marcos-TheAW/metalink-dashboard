/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    usuario: import('./lib/types').Usuario;
  }
}
