// ============================================================
// MARCADORES VISUAIS DAS ZONAS (comida / água / descanso).
// FICAM OCULTOS NO JOGO FINAL: só aparecem
//  - no modo desenvolvedor (?zonas=1 ou tecla V)
//  - ou quando a mecânica pede (zona que o jogador pode usar agora).
// ============================================================
import * as THREE from 'three';
import { ZONE_COLORS, ZONE_LABELS } from './zones.js';

export function createZoneMarkers(scene, zones, { heightAt = null } = {}) {
    const group = new THREE.Group();
    group.name = 'zone-markers';
    group.visible = false;
    const rings = new Map();

    for (const zone of zones.all) {
        const radius = Math.max(6, zone.r);
        const ring = new THREE.Mesh(
            new THREE.RingGeometry(radius * 0.9, radius, 56),
            new THREE.MeshBasicMaterial({ color: ZONE_COLORS[zone.kind], transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
        );
        ring.rotation.x = -Math.PI / 2;
        const y = Number(heightAt ? heightAt(zone.x, zone.z) : 0) + 0.4;
        ring.position.set(zone.x, y, zone.z);
        ring.userData.zone = zone;
        ring.userData.label = ZONE_LABELS[zone.kind] ?? zone.kind;
        group.add(ring);
        rings.set(zone.id, ring);
    }
    scene.add(group);

    let devMode = false;
    let highlightedId = null;

    function apply() {
        group.visible = devMode || !!highlightedId;
        for (const [id, ring] of rings) {
            const active = id === highlightedId;
            ring.visible = devMode || active;
            ring.material.opacity = active ? 0.9 : 0.4;
        }
    }

    return {
        group,
        rings,
        setDevMode(on) { devMode = !!on; apply(); },
        devMode() { return devMode; },
        // Mostra só a zona que a mecânica precisa (beber / descansar).
        highlight(zone) { highlightedId = zone?.id ?? null; apply(); },
        dispose() {
            for (const ring of rings.values()) { ring.geometry.dispose(); ring.material.dispose(); }
            rings.clear();
            scene.remove(group);
        },
    };
}
