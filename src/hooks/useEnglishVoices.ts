"use client";

import { useSyncExternalStore } from "react";
import {
  getServerVoicesSnapshot,
  getVoicesSnapshot,
  subscribeToVoices,
} from "@/lib/speech";

/** Voces en inglés del dispositivo. Llega vacía y se completa sola. */
export function useEnglishVoices(): SpeechSynthesisVoice[] {
  return useSyncExternalStore(
    subscribeToVoices,
    getVoicesSnapshot,
    getServerVoicesSnapshot,
  );
}
