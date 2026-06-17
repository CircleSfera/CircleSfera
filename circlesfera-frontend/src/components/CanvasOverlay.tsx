import React, { useEffect, useRef, useState } from 'react';
import { Image, Layer, Line, Stage, Text, Transformer } from 'react-konva';
import useImage from 'use-image';
import type { OverlayElement } from '../services/edits.service';

interface CanvasOverlayProps {
  width: number;
  height: number;
  overlays: OverlayElement[];
  onChange: (overlays: OverlayElement[]) => void;
  drawMode: boolean;
  brushColor: string;
  brushSize: number;
  stageRef?: React.RefObject<any>;
}

// Separate component for images to use the useImage hook
const URLImage = ({
  image,
  shapeProps,
  isSelected,
  onSelect,
  onChange,
}: any) => {
  const [img] = useImage(image.src);
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && trRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <React.Fragment>
      <Image
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        {...shapeProps}
        image={img}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...shapeProps,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(_e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          // Reset scale and update width/height
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...shapeProps,
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </React.Fragment>
  );
};

const TextNode = ({ shapeProps, isSelected, onSelect, onChange }: any) => {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected && trRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <React.Fragment>
      <Text
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        {...shapeProps}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...shapeProps,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(_e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...shapeProps,
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            width: Math.max(5, node.width() * scaleX),
            scaleX: 1,
            scaleY: 1,
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          enabledAnchors={['middle-left', 'middle-right']}
          boundBoxFunc={(_oldBox, newBox) => {
            newBox.width = Math.max(30, newBox.width);
            return newBox;
          }}
        />
      )}
    </React.Fragment>
  );
};

export default function CanvasOverlay({
  width,
  height,
  overlays,
  onChange,
  drawMode,
  brushColor,
  brushSize,
  stageRef,
}: CanvasOverlayProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isDrawing = useRef(false);

  const checkDeselect = (e: any) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      setSelectedId(null);
    }
  };

  const handleMouseDown = (e: any) => {
    if (!drawMode) return;
    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    const newId = Math.random().toString(36).substr(2, 9);
    onChange([
      ...overlays,
      {
        id: newId,
        type: 'line',
        points: [pos.x, pos.y],
        strokeWidth: brushSize,
        fill: brushColor,
        x: 0,
        y: 0,
      },
    ]);
  };

  const handleMouseMove = (e: any) => {
    if (!drawMode || !isDrawing.current) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    const lastLine = overlays[overlays.length - 1];
    if (lastLine && lastLine.type === 'line') {
      const updatedLine = { ...lastLine };
      updatedLine.points = (updatedLine.points || []).concat([
        point.x,
        point.y,
      ]);
      const newOverlays = overlays.slice(0, overlays.length - 1);
      newOverlays.push(updatedLine);
      onChange(newOverlays);
    }
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      onMouseDown={(e) => {
        checkDeselect(e);
        handleMouseDown(e);
      }}
      onMousemove={handleMouseMove}
      onMouseup={handleMouseUp}
      onTouchStart={(e) => {
        checkDeselect(e);
        handleMouseDown(e);
      }}
      onTouchMove={handleMouseMove}
      onTouchEnd={handleMouseUp}
    >
      <Layer>
        {overlays.map((overlay, i) => {
          if (overlay.type === 'line') {
            return (
              <Line
                key={overlay.id}
                points={overlay.points}
                stroke={overlay.fill}
                strokeWidth={overlay.strokeWidth}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation="source-over"
              />
            );
          }
          if (overlay.type === 'text') {
            return (
              <TextNode
                key={overlay.id}
                shapeProps={overlay}
                isSelected={overlay.id === selectedId}
                onSelect={() => !drawMode && setSelectedId(overlay.id)}
                onChange={(newAttrs: OverlayElement) => {
                  const newOverlays = overlays.slice();
                  newOverlays[i] = newAttrs;
                  onChange(newOverlays);
                }}
              />
            );
          }
          if (overlay.type === 'image') {
            return (
              <URLImage
                key={overlay.id}
                shapeProps={overlay}
                isSelected={overlay.id === selectedId}
                onSelect={() => !drawMode && setSelectedId(overlay.id)}
                onChange={(newAttrs: OverlayElement) => {
                  const newOverlays = overlays.slice();
                  newOverlays[i] = newAttrs;
                  onChange(newOverlays);
                }}
              />
            );
          }
          return null;
        })}
      </Layer>
    </Stage>
  );
}
