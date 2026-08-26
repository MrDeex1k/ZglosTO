import { INCIDENT_IMAGE_MAX_BYTES } from '@zglosto/contracts';
import { describe, expect, test } from 'vitest';

import { bytesToLowercaseHex, IncidentImageError, selectIncidentImage } from './selected-image';

const asset = {
  fileName: 'problem.JPG',
  height: 1200,
  mimeType: null,
  uri: 'file:///cache/problem.JPG',
  width: 1600,
};

describe('incident image selection', () => {
  test('normalizes a supported image and infers its MIME type', () => {
    expect(selectIncidentImage(asset, 2048)).toEqual({
      fileName: 'problem.JPG',
      height: 1200,
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      uri: asset.uri,
      width: 1600,
    });
  });

  test('rejects unsupported and oversized assets', () => {
    expect(() => selectIncidentImage({ ...asset, fileName: 'problem.heic' }, 2048)).toThrow(
      IncidentImageError,
    );
    expect(() => selectIncidentImage(asset, INCIDENT_IMAGE_MAX_BYTES + 1)).toThrowError(
      expect.objectContaining({ code: 'tooLarge' }),
    );
  });

  test('serializes digest bytes as lowercase hexadecimal', () => {
    expect(bytesToLowercaseHex(Uint8Array.from([0, 15, 16, 255]).buffer)).toBe('000f10ff');
  });
});
