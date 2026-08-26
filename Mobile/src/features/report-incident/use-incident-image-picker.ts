import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';

import { loadSelectedIncidentImage, removeSelectedIncidentImage } from './native-image';
import {
  IncidentImageError,
  type IncidentImageErrorCode,
  type SelectedIncidentImage,
} from './selected-image';

function imageErrorKey(error: unknown): IncidentImageErrorCode {
  return error instanceof IncidentImageError ? error.code : 'unavailable';
}

export function useIncidentImagePicker() {
  const [image, setImage] = useState<SelectedIncidentImage | null>(null);
  const imageReference = useRef<SelectedIncidentImage | null>(null);
  const [imageError, setImageError] = useState<IncidentImageErrorCode | 'permission' | null>(null);

  const pickImage = async (source: 'camera' | 'library') => {
    setImageError(null);
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setImageError('permission');
        return;
      }

      const options: ImagePicker.ImagePickerOptions = {
        allowsEditing: false,
        base64: false,
        exif: false,
        mediaTypes: ['images'],
        quality: 1,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset === undefined) {
        setImageError('unavailable');
        return;
      }
      const selectedImage = await loadSelectedIncidentImage(asset);
      if (imageReference.current !== null) removeSelectedIncidentImage(imageReference.current);
      imageReference.current = selectedImage;
      setImage(selectedImage);
    } catch (error) {
      setImageError(imageErrorKey(error));
    }
  };

  const removeImage = () => {
    if (imageReference.current !== null) removeSelectedIncidentImage(imageReference.current);
    imageReference.current = null;
    setImage(null);
    setImageError(null);
  };

  useEffect(
    () => () => {
      if (imageReference.current !== null) removeSelectedIncidentImage(imageReference.current);
    },
    [],
  );

  return { image, imageError, pickImage, removeImage, setImageError };
}
