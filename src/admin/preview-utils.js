import * as THREE from 'three';

/**
 * Calcula a posição Y necessária para que a base do modelo (min.y) encoste
 * exatamente no chão (Y = 0), levando em conta a escala e o offset manual.
 */
export function computeGroundOffsetY(boundsMinY, scale = 1, heightOffset = 0) {
    return -boundsMinY * scale + (Number(heightOffset) || 0);
}

/**
 * Calcula a escala necessária para normalizar um modelo arbitrário
 * para uma caixa padrão no preview (ex.: 2.2m de extensão máxima).
 */
export function computeFitScale(boxSize, targetSpan = 2.2) {
    const maxDimension = Math.max(boxSize.x ?? 0, boxSize.y ?? 0, boxSize.z ?? 0, 0.001);
    return targetSpan / maxDimension;
}

/**
 * Enquadra a câmera em perspectiva para visualizar toda a bounding box
 * a partir de uma visão isométrica suave em 3/4.
 */
export function frameObject(camera, box, { margin = 1.35, minDistance = 0.5, maxDistance = 500 } = {}) {
    if (!camera || !box || box.isEmpty()) return new THREE.Vector3(0, 0, 0);
    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (camera.aspect || 1));
    const effectiveFov = Math.min(verticalFov, horizontalFov);
    const distance = (sphere.radius * margin) / Math.sin(Math.max(effectiveFov / 2, 0.01));
    const clampedDistance = THREE.MathUtils.clamp(distance, minDistance, maxDistance);

    // Ângulo de visão 3/4 ligeiramente elevado
    const viewDirection = new THREE.Vector3(0.65, 0.45, 1).normalize();
    // O alvo mira um pouco abaixo do centro geométrico para valorizar o contato com o chão
    const target = new THREE.Vector3(center.x, box.min.y + (box.max.y - box.min.y) * 0.42, center.z);
    camera.position.copy(target).addScaledVector(viewDirection, clampedDistance);
    camera.lookAt(target);
    return target;
}
