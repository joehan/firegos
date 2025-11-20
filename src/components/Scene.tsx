"use client";

import { Canvas, ThreeEvent, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useState, useEffect } from "react";
import { getSocket } from "@/lib/socket";
import Brick, { BrickType } from "./Brick";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from "firebase/auth";
import { auth, storage } from "@/lib/firebase";

import { collection, addDoc, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

interface BrickData {
  id: string;
  position: [number, number, number];
  color: string;
  type: BrickType;
  rotation: number;
}

const BRICK_DIMENSIONS: Record<BrickType, [number, number]> = {
  "1x1": [0.5, 0.5],
  "1x2": [0.5, 1],
  "1x4": [0.5, 2],
  "2x2": [1, 1],
  "2x4": [1, 2],
  "4x4": [2, 2],
};

function SceneContent({
  bricks,
  onBrickClick,
  onPlaneClick,
  captureTrigger,
  onScreenshot
}: {
  bricks: BrickData[],
  onBrickClick: (e: ThreeEvent<MouseEvent>, b: BrickData) => void,
  onPlaneClick: (e: ThreeEvent<MouseEvent>) => void,
  captureTrigger: number,
  onScreenshot: (url: string) => void
}) {
  const { gl } = useThree();

  useEffect(() => {
    if (captureTrigger > 0) {
      onScreenshot(gl.domElement.toDataURL("image/png"));
    }
  }, [captureTrigger, gl, onScreenshot]);

  return (
    <>
      <ambientLight intensity={0.8} />
      <pointLight position={[10, 10, 10]} intensity={1.5} />
      <Grid
        args={[20, 20]}
        cellSize={1}
        cellThickness={1}
        cellColor="#6f6f6f"
        sectionSize={5}
        sectionThickness={1.5}
        sectionColor="#9d4b4b"
        fadeDistance={50}
        infiniteGrid
      />
      {/* Invisible plane for clicking */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} onClick={onPlaneClick}>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <OrbitControls makeDefault />

      {bricks.map((brick) => (
        <Brick
          key={brick.id}
          position={brick.position}
          color={brick.color}
          type={brick.type}
          rotation={brick.rotation}
          onClick={(e) => onBrickClick(e, brick)}
        />
      ))}
    </>
  );
}

export default function Scene() {
  const [socket, setSocket] = useState<any>(null);
  const [bricks, setBricks] = useState<BrickData[]>([]);
  const [selectedColor, setSelectedColor] = useState("#ff8a80");
  const [selectedType, setSelectedType] = useState<BrickType>("2x2");
  const [rotation, setRotation] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [creations, setCreations] = useState<any[]>([]);
  const [captureTrigger, setCaptureTrigger] = useState(0);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [creationName, setCreationName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const socketIo = getSocket();
    setSocket(socketIo);

    socketIo.on("connect", () => {
      console.log("Connected to socket", socketIo.id);
      socketIo.emit("join-room", "default-room");
    });

    socketIo.on("place-brick", (data: { brick: BrickData }) => {
      setBricks((prev) => [...prev, data.brick]);
    });

    socketIo.on("remove-brick", (data: { brickId: string }) => {
      setBricks((prev) => prev.filter((b) => b.id !== data.brickId));
    });

    socketIo.on("clear", () => {
      setBricks([]);
    });

    return () => {
      socketIo.off("connect");
      socketIo.off("place-brick");
      socketIo.off("remove-brick");
      socketIo.off("clear");
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "r") {
        setRotation((prev) => prev + Math.PI / 2);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const addBrick = (position: [number, number, number]) => {
    const newBrick: BrickData = {
      id: Math.random().toString(36).substr(2, 9),
      position,
      color: selectedColor,
      type: selectedType,
      rotation: rotation % (Math.PI * 2),
    };
    setBricks((prev) => [...prev, newBrick]);
    socket?.emit("place-brick", { roomId: "default-room", brick: newBrick });
  };

  const removeBrick = (brickId: string) => {
    setBricks((prev) => prev.filter((b) => b.id !== brickId));
    socket?.emit("remove-brick", { roomId: "default-room", brickId });
  };

  const triggerSave = () => {
    if (!user) return alert("Please login to save");
    setShowSaveModal(true);
  };

  const confirmSave = () => {
    if (!creationName) return alert("Please enter a name");
    setShowSaveModal(false);
    setCaptureTrigger(t => t + 1);
  };

  const handleScreenshot = async (dataUrl: string) => {
    try {
      const storageRef = ref(storage, `screenshots/${user!.uid}/${Date.now()}.png`);
      await uploadString(storageRef, dataUrl, 'data_url');
      const screenshotUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "creations"), {
        authorId: user!.uid,
        authorName: user!.displayName || "Anonymous",
        name: creationName,
        bricks,
        screenshotUrl,
        createdAt: new Date(),
      });
      alert("Saved!");
      setCreationName("");
    } catch (e) {
      console.error("Error saving document: ", e);
      alert("Error saving");
    }
  };

  const loadCreations = async () => {
    const q = query(collection(db, "creations"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    const data = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setCreations(data);
    setShowGallery(true);
  };

  const loadCreation = (creation: any) => {
    setBricks(creation.bricks);
    setShowGallery(false);
    socket?.emit("clear", "default-room");
    creation.bricks.forEach((b: any) => {
      socket?.emit("place-brick", { roomId: "default-room", brick: b });
    });
  };

  const snapToGrid = (val: number, size: number) => {
    // Even size (1, 2) -> snap to 0.5
    // Odd size (0.5, 1.5) -> snap to 0.25 + 0.5*k
    const isOdd = (size * 2) % 2 !== 0;
    if (isOdd) {
      return Math.floor(val * 2) / 2 + 0.25;
    } else {
      return Math.round(val * 2) / 2;
    }
  };

  const getBrickDimensions = (type: BrickType, rot: number) => {
    const [w, d] = BRICK_DIMENSIONS[type];
    // If rotated 90 or 270 degrees, swap width and depth
    const isRotated = Math.abs(rot % Math.PI) > 0.1;
    return isRotated ? [d, w] : [w, d];
  };

  const onPlaneClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const point = e.point;
    const [w, d] = getBrickDimensions(selectedType, rotation);

    const x = snapToGrid(point.x, w);
    const z = snapToGrid(point.z, d);

    addBrick([x, 0.5, z]);
  };

  const onBrickClick = (e: ThreeEvent<MouseEvent>, brick: BrickData) => {
    e.stopPropagation();
    if (e.altKey || isDeleting) {
      removeBrick(brick.id);
      return;
    }
    if (!e.face) return;

    const normal = e.face.normal;
    const point = e.point;

    const [newW, newD] = getBrickDimensions(selectedType, rotation);
    const [oldW, oldD] = getBrickDimensions(brick.type, brick.rotation);

    // Calculate ideal position based on normal
    let x = point.x;
    let y = point.y;
    let z = point.z;

    // Adjust center based on which face we clicked
    // We want to move 'out' by half the new dimension
    if (Math.abs(normal.x) > 0.5) {
      x = brick.position[0] + normal.x * (oldW / 2 + newW / 2);
    } else if (Math.abs(normal.y) > 0.5) {
      y = brick.position[1] + normal.y * (1 / 2 + 1 / 2); // Height is always 1
    } else if (Math.abs(normal.z) > 0.5) {
      z = brick.position[2] + normal.z * (oldD / 2 + newD / 2);
    }

    // Snap to grid
    x = snapToGrid(x, newW);
    z = snapToGrid(z, newD);
    // Y is always integer + 0.5 for stacking
    y = Math.round(y - 0.5) + 0.5;

    addBrick([x, y, z]);
  };

  return (
    <div className="h-screen w-full bg-blue-50 relative">
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-10 flex gap-2 bg-white/80 p-2 rounded backdrop-blur-sm items-center shadow-lg">
        {["#ff8a80", "#b9f6ca", "#82b1ff", "#ffff8d", "#ffffff", "#212121", "#ffd180", "#ea80fc"].map((color) => (
          <button
            key={color}
            className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${selectedColor === color ? "border-white scale-110" : "border-transparent"}`}
            style={{ backgroundColor: color }}
            onClick={() => setSelectedColor(color)}
          />
        ))}
        <div className="w-px h-8 bg-gray-300 mx-2" />
        {/* Brick Types */}
        {(["1x1", "1x2", "1x4", "2x2", "2x4", "4x4"] as BrickType[]).map((type) => (
          <button
            key={type}
            className={`px-2 py-1 rounded text-xs font-bold transition-colors ${selectedType === type ? "bg-white text-black" : "bg-black/20 text-white hover:bg-black/40"}`}
            onClick={() => setSelectedType(type)}
          >
            {type}
          </button>
        ))}
        <div className="w-px h-8 bg-gray-300 mx-2" />
        <button
          onClick={() => setRotation(r => r + Math.PI / 2)}
          className="px-2 py-1 rounded text-xs font-bold bg-black/20 text-white hover:bg-black/40 flex items-center gap-1"
        >
          <span>↻</span> Rotate
        </button>
        <div className="w-px h-8 bg-gray-300 mx-2" />
        <button
          onClick={() => setIsDeleting(!isDeleting)}
          className={`px-2 py-1 rounded text-xs font-bold transition-colors flex items-center gap-1 ${isDeleting ? "bg-red-500 text-white" : "bg-black/20 text-white hover:bg-black/40"}`}
        >
          <span>🗑️</span> {isDeleting ? "Done" : "Erase"}
        </button>
        <div className="w-px h-8 bg-gray-300 mx-2" />
        {user ? (
          <div className="flex items-center gap-2">
            <img src={user.photoURL || ""} alt="User" className="w-8 h-8 rounded-full" />
            <button onClick={() => signOut(auth)} className="text-white text-sm bg-red-500/80 px-2 py-1 rounded hover:bg-red-600">Logout</button>
            <button onClick={triggerSave} className="text-white text-sm bg-green-500/80 px-3 py-1 rounded hover:bg-green-600">Save</button>
            <button onClick={loadCreations} className="text-white text-sm bg-yellow-500/80 px-3 py-1 rounded hover:bg-yellow-600">Gallery</button>
          </div>
        ) : (
          <button onClick={() => signInWithPopup(auth, new GoogleAuthProvider())} className="text-white text-sm bg-blue-500/80 px-3 py-1 rounded hover:bg-blue-600">Login</button>
        )}
      </div>

      {showGallery && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto text-black shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">Gallery</h2>
              <button onClick={() => setShowGallery(false)} className="text-red-500 font-bold hover:text-red-700">Close</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {creations.map((creation) => (
                <div key={creation.id} className="border p-4 rounded cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => loadCreation(creation)}>
                  {creation.screenshotUrl && <img src={creation.screenshotUrl} alt={creation.name} className="w-full h-32 object-cover mb-2 rounded" />}
                  <h3 className="font-bold">{creation.name}</h3>
                  <p className="text-sm text-gray-500">by {creation.authorName}</p>
                  <p className="text-xs text-gray-400">{new Date(creation.createdAt.seconds * 1000).toLocaleDateString()}</p>
                  <p className="text-xs mt-2">{creation.bricks.length} bricks</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-lg w-96 text-black shadow-xl">
            <h2 className="text-xl font-bold mb-4">Save Creation</h2>
            <input
              type="text"
              placeholder="Creation Name"
              value={creationName}
              onChange={(e) => setCreationName(e.target.value)}
              className="w-full border p-2 rounded mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
              <button onClick={confirmSave} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">Save</button>
            </div>
          </div>
        </div>
      )}

      <Canvas camera={{ position: [10, 10, 10], fov: 50 }} gl={{ preserveDrawingBuffer: true }}>
        <SceneContent
          bricks={bricks}
          onBrickClick={onBrickClick}
          onPlaneClick={onPlaneClick}
          captureTrigger={captureTrigger}
          onScreenshot={handleScreenshot}
        />
      </Canvas>
    </div>
  );
}
