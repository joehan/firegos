import { Edges } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { mergeBufferGeometries } from "three-stdlib";

export type BrickType = "1x1" | "1x2" | "1x4" | "2x2" | "2x4" | "4x4";

interface BrickProps {
  position: [number, number, number];
  color: string;
  type?: BrickType;
  rotation?: number;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

const BRICK_DIMENSIONS: Record<BrickType, [number, number]> = {
  "1x1": [0.5, 0.5],
  "1x2": [0.5, 1],
  "1x4": [0.5, 2],
  "2x2": [1, 1],
  "2x4": [1, 2],
  "4x4": [2, 2],
};

export default function Brick({ position, color, type = "2x2", rotation = 0, onClick }: BrickProps) {
  const [width, depth] = BRICK_DIMENSIONS[type];

  const geometry = useMemo(() => {
    const geometries: THREE.BufferGeometry[] = [];

    // Base Geometry
    const baseGeo = new THREE.BoxGeometry(width, 1, depth);
    geometries.push(baseGeo);

    // Stud Geometry
    const studGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.2, 16);

    const studCountX = width * 2;
    const studCountZ = depth * 2;
    const startX = -(width / 2) + 0.25;
    const startZ = -(depth / 2) + 0.25;

    for (let x = 0; x < studCountX; x++) {
      for (let z = 0; z < studCountZ; z++) {
        const px = startX + x * 0.5;
        const py = 0.601;
        const pz = startZ + z * 0.5;

        const instance = studGeo.clone();
        instance.translate(px, py, pz);
        geometries.push(instance);
      }
    }

    const merged = mergeBufferGeometries(geometries) as THREE.BufferGeometry;
    return merged;
  }, [width, depth]);

  return (
    <group position={position} rotation={[0, rotation, 0]} onClick={onClick}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color} />
        <Edges color="black" threshold={30} />
      </mesh>
    </group>
  );
}
