import React, { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import { X, Check, RotateCcw, RotateCw } from 'lucide-react'
import getCroppedImg from '../utils/imageUtils'

interface ImageCropperProps {
  image: string
  aspectRatio?: number
  onCropComplete: (croppedBlob: Blob) => void
  onCancel: () => void
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  image,
  aspectRatio = 1,
  onCropComplete,
  onCancel,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null)

  const onCropChange = (crop: { x: number; y: number }) => {
    setCrop(crop)
  }

  const onCropCompleteInternal = useCallback(
    (_croppedArea: any, croppedAreaPixels: any) => {
      setCroppedAreaPixels(croppedAreaPixels)
    },
    []
  )

  const onZoomChange = (zoom: number) => {
    setZoom(zoom)
  }

  const handleSave = async () => {
    try {
      const croppedBlob = await getCroppedImg(
        image,
        croppedAreaPixels,
        rotation
      )
      if (croppedBlob) {
        onCropComplete(croppedBlob)
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] bg-charcoal/90 flex flex-col items-center justify-center p-4">
      <div className="relative w-full max-w-4xl h-[70vh] bg-white rounded-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex flex-col p-4 border-b border-charcoal/10 bg-white z-10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-serif font-bold text-charcoal">Edit & Rotate Image</h3>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-charcoal/5 rounded-full text-charcoal/50 hover:text-charcoal transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-charcoal/60 mt-1">
            Drag to center the person's face. Use the zoom slider below to focus in.
          </p>
        </div>

        {/* Cropper Container */}
        <div className="relative flex-1 bg-charcoal/5">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspectRatio}
            onCropChange={onCropChange}
            onCropComplete={onCropCompleteInternal}
            onZoomChange={onZoomChange}
          />
        </div>

        {/* Controls */}
        <div className="p-6 bg-white border-t border-charcoal/10 z-10">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-charcoal/60 w-12">Zoom</span>
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-tan"
              />
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-charcoal/60 w-12">Rotate</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRotation((prev) => (prev - 90 + 360) % 360)}
                  className="p-2 bg-tan/10 text-tan hover:bg-tan hover:text-white rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
                  title="Rotate 90° CCW"
                >
                  <RotateCcw size={16} /> -90°
                </button>
                <button
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  className="p-2 bg-tan/10 text-tan hover:bg-tan hover:text-white rounded-lg transition-all flex items-center gap-2 text-xs font-bold"
                  title="Rotate 90° CW"
                >
                  <RotateCw size={16} /> +90°
                </button>
              </div>
              <input
                type="range"
                value={rotation}
                min={0}
                max={360}
                step={1}
                aria-labelledby="Rotation"
                onChange={(e) => setRotation(Number(e.target.value))}
                className="flex-1 accent-tan"
              />
              <button
                onClick={() => setRotation(0)}
                className="p-1 hover:bg-charcoal/5 rounded-full text-charcoal/40 hover:text-charcoal"
                title="Reset Rotation"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-charcoal/60 hover:text-charcoal font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 bg-tan text-white px-6 py-2 rounded-lg font-medium hover:bg-charcoal transition-colors shadow-lg shadow-tan/20"
            >
              <Check size={18} />
              Apply Crop
            </button>
          </div>
        </div>
      </div>
      <p className="mt-4 text-white/60 text-sm">Drag to move, use sliders to adjust scale and rotation.</p>
    </div>
  )
}
