import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeCanvasProps {
  stage: string;
  percent: number;
}

export const ThreeCanvas: React.FC<ThreeCanvasProps> = ({ stage, percent }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef(stage);
  const percentRef = useRef(percent);

  stageRef.current = stage;
  percentRef.current = percent;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050814, 0.035);

    const width = container.clientWidth || 680;
    const height = container.clientHeight || 450;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.4, 5.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 2. Central Holographic Core Group
    const coreGroup = new THREE.Group();
    coreGroup.position.set(1.5, 0.2, 0); // Positioned slightly to the right side of the window
    scene.add(coreGroup);

    // 2a. Inner Crystal (Icosahedron)
    const crystalGeo = new THREE.IcosahedronGeometry(0.7, 0);
    const crystalMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    coreGroup.add(crystal);

    // 2b. Solid glowing inner orb
    const orbGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const orbMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.7,
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    coreGroup.add(orb);

    // 2c. Gimbal Ring 1 (Cyan)
    const ring1Geo = new THREE.TorusGeometry(1.05, 0.02, 8, 48);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.6,
    });
    const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
    coreGroup.add(ring1);

    // 2d. Gimbal Ring 2 (Neon Magenta / Violet)
    const ring2Geo = new THREE.TorusGeometry(1.3, 0.018, 8, 48);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0xd946ef,
      transparent: true,
      opacity: 0.5,
    });
    const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
    ring2.rotation.x = Math.PI / 3;
    coreGroup.add(ring2);

    // 2e. Gimbal Ring 3 (Outer Gold / Amber)
    const ring3Geo = new THREE.TorusGeometry(1.55, 0.015, 8, 48);
    const ring3Mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.4,
    });
    const ring3 = new THREE.Mesh(ring3Geo, ring3Mat);
    ring3.rotation.y = Math.PI / 4;
    coreGroup.add(ring3);

    // 3. 3D Particle Starfield & Warp Tunnel
    const particleCount = 600;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const originalZ = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      positions[idx] = (Math.random() - 0.5) * 14;
      positions[idx + 1] = (Math.random() - 0.5) * 10;
      positions[idx + 2] = (Math.random() - 0.5) * 16;
      originalZ[i] = positions[idx + 2];
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.035,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.65,
    });
    const particleSystem = new THREE.Points(particleGeo, particleMat);
    scene.add(particleSystem);

    // 4. Cyberpunk Neon Floor Grid
    const gridHelper = new THREE.GridHelper(24, 28, 0x00f0ff, 0x1e293b);
    gridHelper.position.y = -2.1;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.25;
    scene.add(gridHelper);

    // 5. Interactive Mouse Orbit & Parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const onPointerMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      if (isDragging) {
        const deltaX = e.clientX - prevMouseX;
        const deltaY = e.clientY - prevMouseY;
        targetRotationY += deltaX * 0.012;
        targetRotationX += deltaY * 0.012;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      } else {
        mouseX = x;
        mouseY = y;
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      // Allow dragging on right half of window where the 3D core lives
      const rect = container.getBoundingClientRect();
      if (e.clientX - rect.left > rect.width * 0.45) {
        isDragging = true;
        prevMouseX = e.clientX;
        prevMouseY = e.clientY;
      }
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);

    // 6. Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const delta = clock.getDelta();
      const currentStage = stageRef.current;
      const currentPercent = percentRef.current;
      const isExtracting = currentStage === 'extracting';
      const isCompleted = currentStage === 'completed';

      // Speed multiplier during installation warp
      const speed = isExtracting ? 3.5 : isCompleted ? 0.8 : 1.0;

      // Rotate core components
      crystal.rotation.x += delta * 0.8 * speed;
      crystal.rotation.y += delta * 1.1 * speed;

      ring1.rotation.x += delta * 0.9 * speed;
      ring1.rotation.y += delta * 0.4 * speed;

      ring2.rotation.y += delta * 0.7 * speed;
      ring2.rotation.z += delta * 0.5 * speed;

      ring3.rotation.x += delta * 0.3 * speed;
      ring3.rotation.z += delta * 0.8 * speed;

      // Color Shift based on install progress
      if (isExtracting) {
        const ratio = currentPercent / 100;
        crystalMat.color.setRGB(ratio, 0.94 - ratio * 0.4, 1.0 - ratio * 0.2);
        particleMat.color.setRGB(0.2 + ratio * 0.8, 0.7 - ratio * 0.3, 1.0);
      } else if (isCompleted) {
        crystalMat.color.setHex(0x10b981); // Emerald / Victory Green
        orbMat.color.setHex(0x34d399);
        ring1Mat.color.setHex(0x10b981);
      }

      // Parallax / Orbit Smoothing
      if (!isDragging) {
        targetRotationY += (mouseX * 0.8 - targetRotationY) * 0.05;
        targetRotationX += (mouseY * 0.6 - targetRotationX) * 0.05;
      }
      coreGroup.rotation.y = targetRotationY;
      coreGroup.rotation.x = targetRotationX;

      // Grid scrolling motion
      gridHelper.position.z = (gridHelper.position.z + delta * 1.2 * speed) % 2;

      // 3D Starfield warp stream
      const posAttr = particleGeo.attributes.position as THREE.BufferAttribute;
      const array = posAttr.array as Float32Array;
      const warpSpeed = isExtracting ? delta * 14 : delta * 1.8;

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3 + 2;
        array[idx] += warpSpeed;
        if (array[idx] > 6) {
          array[idx] = -10;
        }
      }
      posAttr.needsUpdate = true;

      // Floating bobbing effect
      coreGroup.position.y = 0.2 + Math.sin(clock.getElapsedTime() * 1.5) * 0.08;

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 pointer-events-auto overflow-hidden z-0"
      style={{ cursor: 'grab' }}
      title="Click and drag to rotate 3D Quantum Core"
    />
  );
};
