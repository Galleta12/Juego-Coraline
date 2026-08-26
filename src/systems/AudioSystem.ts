import { CROSSFADE_MS, MUSIC, MUSIC_MASTER } from "@/config/music";

/**
 * Audio del juego.
 *
 * Los efectos se sintetizan en el navegador: no hay archivos que
 * descargar ni que puedan faltar al desplegar. La musica si viene de
 * archivos, y se declara en config/music.ts — si una escena no tiene
 * pista, suena sin musica y ya.
 */

type OscType = OscillatorType;

export interface HissHandle {
  setIntensity(v: number): void;
  stop(): void;
}

class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private buffers = new Map<string, AudioBuffer>();
  private playing: { src: AudioBufferSourceNode; gain: GainNode; key: string } | null = null;
  private muted = false;

  /* ── Ciclo de vida ─────────────────────────────────────────────── */

  /** Crea el contexto. Debe llamarse desde un gesto del usuario. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = MUSIC_MASTER;
    this.musicBus.connect(this.master);

    const frames = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(value ? 0 : 1, this.ctx.currentTime, 0.04);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /* ── Musica ────────────────────────────────────────────────────── */

  /**
   * Carga la pista de una escena si esta declarada. Silencioso si no
   * existe el archivo: la escena simplemente ira sin musica.
   */
  async preloadTrack(key: string): Promise<boolean> {
    const track = MUSIC[key];
    if (!this.ctx || !track || !track.file) return false;
    if (this.buffers.has(key)) return true;
    try {
      const res = await fetch(`assets/audio/${track.file}`);
      if (!res.ok) return false;
      const type = res.headers.get("content-type") ?? "";
      if (type.includes("text/html")) return false; // 404 servido como index
      this.buffers.set(key, await this.ctx.decodeAudioData(await res.arrayBuffer()));
      return true;
    } catch {
      return false;
    }
  }

  /** Cambia de pista con crossfade. Si no hay pista, hace fade a silencio. */
  async playMusic(key: string): Promise<void> {
    if (!this.ctx || !this.musicBus) return;
    if (this.playing?.key === key) return;

    await this.preloadTrack(key);
    const buffer = this.buffers.get(key);
    const now = this.ctx.currentTime;
    const fade = CROSSFADE_MS / 1000;

    if (this.playing) {
      const old = this.playing;
      old.gain.gain.setTargetAtTime(0.0001, now, fade / 3);
      setTimeout(() => {
        try {
          old.src.stop();
        } catch {
          /* ya parada */
        }
      }, CROSSFADE_MS + 120);
      this.playing = null;
    }

    if (!buffer) return;

    const track = MUSIC[key]!;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = track.loop;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(track.volume, now + fade);
    src.connect(gain);
    gain.connect(this.musicBus);
    src.start();
    this.playing = { src, gain, key };
  }

  /** Clave de la pista que suena, o null. Sonda para el QA. */
  nowPlaying(): { key: string } | null {
    return this.playing ? { key: this.playing.key } : null;
  }

  /**
   * Baja (o devuelve) el volumen de la musica, sin cortarla.
   *
   * Se usa en las transiciones de tramo: un volumen un poco mas bajo que
   * el normal ayuda a que la pausa se sienta como un momento de tension
   * en vez de una pantalla de carga cualquiera.
   */
  duckMusic(active: boolean, ms = 300): void {
    if (!this.musicBus || !this.ctx) return;
    const target = active ? MUSIC_MASTER * 0.4 : MUSIC_MASTER;
    this.musicBus.gain.setTargetAtTime(target, this.ctx.currentTime, ms / 1000);
  }

  stopMusic(): void {
    if (!this.playing || !this.ctx) return;
    const old = this.playing;
    old.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
    setTimeout(() => {
      try {
        old.src.stop();
      } catch {
        /* ya parada */
      }
    }, 700);
    this.playing = null;
  }

  /* ── Ladrillos de sintesis ─────────────────────────────────────── */

  private blip(
    f0: number,
    f1: number,
    dur: number,
    type: OscType = "square",
    gain = 0.14,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(
    dur: number,
    gain: number,
    from: number,
    to: number,
    delay = 0,
    q = 1,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuffer) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* ── Efectos ───────────────────────────────────────────────────── */

  readonly sfx = {
    /* jugadora */
    step: () => this.noise(0.05, 0.035, 900, 320, 0, 0.8),
    jump: () => this.blip(320, 620, 0.11, "square", 0.09),
    land: () => this.noise(0.08, 0.09, 520, 130),
    hurt: () => this.blip(320, 70, 0.3, "sawtooth", 0.13),
    die: () => {
      this.blip(300, 50, 0.7, "sawtooth", 0.14);
      this.noise(0.8, 0.1, 900, 60);
    },

    /* pico y minado */
    pickaxeSwing: () => this.blip(200, 110, 0.09, "triangle", 0.06),
    pickaxeHit: () => {
      this.blip(260, 130, 0.07, "square", 0.1);
      this.noise(0.11, 0.11, 2600, 500, 0, 1.4);
    },
    blockBreak: () => {
      this.noise(0.3, 0.17, 2800, 240);
      this.blip(150, 55, 0.22, "triangle", 0.09);
    },

    /* pistola Monster */
    gunShot: () => {
      this.blip(880, 220, 0.1, "sawtooth", 0.09);
      this.noise(0.09, 0.09, 3200, 900, 0, 1.2);
    },
    projectileHit: () => {
      this.blip(520, 180, 0.08, "square", 0.08);
      this.noise(0.1, 0.07, 1800, 500);
    },

    /* enemigos */
    villagerGroan: () => this.blip(150, 96, 0.42, "sawtooth", 0.07),
    villagerHurt: () => this.blip(220, 110, 0.16, "sawtooth", 0.09),
    villagerDie: () => {
      this.blip(180, 60, 0.5, "sawtooth", 0.1);
      this.noise(0.4, 0.08, 700, 120);
    },
    creeperExplode: () => {
      this.noise(0.9, 0.34, 1500, 40);
      this.blip(130, 26, 0.85, "sawtooth", 0.2);
    },

    /* boss */
    bossSlam: () => {
      this.noise(0.5, 0.26, 900, 55);
      this.blip(110, 34, 0.5, "sawtooth", 0.16);
    },
    bossHurt: () => this.blip(420, 140, 0.24, "sawtooth", 0.12),
    bossRoar: () => {
      this.blip(190, 84, 0.9, "sawtooth", 0.14);
      this.noise(1.0, 0.09, 620, 130);
    },
    bossDie: () => {
      this.blip(220, 40, 1.5, "sawtooth", 0.16);
      this.noise(1.6, 0.12, 900, 50);
    },
    /** Carga: sube de tono, avisa de que viene una cebolla. */
    onionCharge: () => this.blip(180, 640, 0.5, "triangle", 0.09),
    onionThrow: () => {
      this.blip(520, 200, 0.2, "sine", 0.11);
      this.noise(0.12, 0.08, 1400, 500);
    },
    onionSplat: () => this.noise(0.22, 0.14, 900, 200),

    /* aliados y objetos */
    /** Aparicion del totem: tres notas que suben. Se oye desde lejos. */
    totem: () => {
      this.blip(440, 660, 0.22, "triangle", 0.13);
      setTimeout(() => this.blip(660, 880, 0.22, "triangle", 0.13), 130);
      setTimeout(() => this.blip(880, 1180, 0.34, "sine", 0.15), 280);
    },
    leonShot: () => {
      this.noise(0.13, 0.2, 3400, 220);
      this.blip(150, 44, 0.15, "square", 0.11);
    },
    catMeow: () => {
      this.blip(620, 780, 0.14, "sine", 0.08);
      this.blip(780, 520, 0.18, "sine", 0.07, 0.13);
    },
    catHiss: () => this.noise(0.34, 0.1, 3600, 1400, 0, 0.6),
    dogArrive: () => {
      [0, 0.09, 0.18].forEach((d, i) =>
        this.blip([660, 880, 1046][i]!, [660, 880, 1046][i]!, 0.12, "triangle", 0.09, d),
      );
    },
    cake: () => {
      this.blip(520, 780, 0.1, "sine", 0.11);
      this.blip(780, 1170, 0.13, "sine", 0.09, 0.09);
    },
    coffee: () => {
      this.blip(220, 900, 0.24, "square", 0.09);
      this.noise(0.34, 0.06, 300, 3200);
    },
    key: () => {
      this.blip(880, 1320, 0.13, "triangle", 0.1);
      this.blip(1320, 1760, 0.18, "triangle", 0.08, 0.12);
    },
    door: () => {
      this.noise(0.5, 0.12, 420, 120);
      this.blip(120, 78, 0.5, "triangle", 0.08);
    },
    diamond: () => {
      [0, 0.09, 0.18, 0.3].forEach((d, i) =>
        this.blip([784, 988, 1319, 1568][i]!, [784, 988, 1319, 1568][i]!, 0.26, "sine", 0.1, d),
      );
    },
    victory: () => {
      [0, 0.12, 0.24, 0.4].forEach((d, i) =>
        this.blip([523, 659, 784, 1046][i]!, [523, 659, 784, 1046][i]!, 0.34, "triangle", 0.11, d),
      );
    },

    /* interfaz */
    uiHover: () => this.blip(560, 660, 0.05, "sine", 0.05),
    uiSelect: () => this.blip(660, 880, 0.07, "square", 0.07),
    uiConfirm: () => {
      this.blip(523, 784, 0.12, "triangle", 0.1);
      this.blip(784, 1046, 0.18, "triangle", 0.08, 0.11);
    },
    uiDeny: () => this.blip(200, 120, 0.18, "square", 0.09),
    pageTurn: () => this.noise(0.26, 0.07, 1800, 500, 0, 0.7),
    typewriter: () => this.noise(0.04, 0.09, 3000, 1100),
  };

  /**
   * Siseo del creeper. Devuelve un mando para subir la intensidad segun
   * se acerca: es la mitad del susto.
   */
  startHiss(): HissHandle {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuffer) {
      return { setIntensity: () => undefined, stop: () => undefined };
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2600;
    filter.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.value = 0.0001;

    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxBus);
    src.start();

    return {
      setIntensity: (v: number) => {
        const x = Math.max(0, Math.min(1, v));
        g.gain.setTargetAtTime(0.0001 + x * 0.32, ctx.currentTime, 0.07);
        filter.frequency.setTargetAtTime(1700 + x * 4000, ctx.currentTime, 0.1);
      },
      stop: () => {
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
        setTimeout(() => {
          try {
            src.stop();
          } catch {
            /* ya parada */
          }
        }, 240);
      },
    };
  }
}

export const audio = new AudioSystem();
