/**
 * RepArena XR: RepArena hecho con el Immersive Web SDK de Meta (IWSDK).
 * Arranca el mundo con el proyecto (iwsdk.config.json) y registra los sistemas del juego: el de las manos justo detrás de
 * la entrada de IWSDK, y los de la partida detrás de la física (así leen las posiciones ya calculadas en cada paso).
 */
import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { EnemySystem } from './combat/enemies.js';
import { FlyerSystem } from './combat/flyers.js';
import { HatchSystem } from './combat/hatch-foes.js';
import { ArcsSystem } from './modes/arcs/arcs-system.js';
import { EnvSystem } from './env/env-system.js';
import { BarsSystem } from './modes/bars/bars-system.js';
import { TouchSystem } from './modes/touch/touch-system.js';
import { GameSystem } from './combat/game.js';
import { GateSystem } from './combat/gates.js';
import { HandSystem } from './input/hand-system.js';
import { GloveSystem } from './input/glove-system.js';
import { FitTextSystem } from './ui/fit-text.js';
import { SolidKeysSystem } from './ui/solid-keys.js';
import { PerfStartSystem, PerfSystem } from './ui/perf-system.js';
import { ComicSystem } from './style/comic-system.js';
import { SoundSystem } from './audio/sound.js';
import { ViewSystem } from './ui/view-panels.js';
import { GoalsSystem } from './ui/goals-intro.js';
import { MenuSystem } from './ui/menu.js';
import { ScreenSystem } from './ui/screen.js';
import { useLocalInputModels } from './input/input-models.js';
import { devInit } from './core/dev.js';
import { initSettings } from './core/settings.js';
import { pageWorld, startPage } from './page/page.js';

// tus ajustes (los mismos que en RepArena: se comparten) y las manos y mandos desde el propio juego, antes de crear el mundo
initSettings();
devInit(); // (las canciones de cada ejercicio, de la tabla del desarrollador)
useLocalInputModels();
startPage(); // (la página: se ve en cuanto carga, sin esperar a la escena)

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.registerSystem(PerfStartSystem, { priority: -100 }); // (el medidor: cuándo empieza el fotograma)
  world.registerSystem(HandSystem, { priority: 4 });
  world.registerSystem(GateSystem, { priority: 4 });
  world.registerSystem(EnemySystem, { priority: 5 });
  world.registerSystem(FlyerSystem, { priority: 5 });
  world.registerSystem(HatchSystem, { priority: 5 });
  world.registerSystem(ArcsSystem, { priority: 5 });
  world.registerSystem(TouchSystem, { priority: 5 });
  world.registerSystem(BarsSystem, { priority: 5 });
  world.registerSystem(EnvSystem, { priority: 7 });
  world.registerSystem(GameSystem, { priority: 6 });
  world.registerSystem(MenuSystem, { priority: 6 });
  world.registerSystem(ScreenSystem, { priority: 6 });
  world.registerSystem(ViewSystem, { priority: 6 });
  world.registerSystem(GoalsSystem, { priority: 6 });
  world.registerSystem(SolidKeysSystem, { priority: 7 });
  world.registerSystem(GloveSystem, { priority: 7 }); // (detrás de la partida: el mundo ya está en su sitio)
  world.registerSystem(ComicSystem, { priority: 7 });
  world.registerSystem(SoundSystem, { priority: 8 });
  world.registerSystem(FitTextSystem, { priority: 8 }); // (que las letras quepan en sus botones)
  world.registerSystem(PerfSystem, { priority: 100 }); // (el medidor y el registro de tirones: después de todo)
  pageWorld(world);
});
