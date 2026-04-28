/**
 * DICOM Tools Enhancer
 * Advanced utilities for DICOM viewer functionality
 */

// Anatomical windowing presets for different body regions
export const ANATOMICAL_PRESETS = {
  // CT Presets
  'CT_Lung': { windowCenter: -600, windowWidth: 1600, description: 'Lung parenchyma visualization' },
  'CT_Mediastinum': { windowCenter: 50, windowWidth: 350, description: 'Mediastinal structures' },
  'CT_Abdomen': { windowCenter: 60, windowWidth: 400, description: 'Abdominal soft tissue' },
  'CT_Bone': { windowCenter: 300, windowWidth: 1500, description: 'Bone and calcifications' },
  'CT_Brain': { windowCenter: 40, windowWidth: 80, description: 'Brain tissue contrast' },
  'CT_Liver': { windowCenter: 30, windowWidth: 150, description: 'Hepatic parenchyma' },
  'CT_Spine': { windowCenter: 250, windowWidth: 1800, description: 'Spinal structures' },
  'CT_Angio': { windowCenter: 300, windowWidth: 600, description: 'Vascular enhancement' },
  
  // MRI Presets
  'MRI_T1': { windowCenter: 600, windowWidth: 1200, description: 'T1-weighted imaging' },
  'MRI_T2': { windowCenter: 1000, windowWidth: 2000, description: 'T2-weighted imaging' },
  'MRI_FLAIR': { windowCenter: 800, windowWidth: 1600, description: 'FLAIR sequences' },
  'MRI_DWI': { windowCenter: 500, windowWidth: 1000, description: 'Diffusion-weighted' },
  
  // X-Ray Presets
  'XR_Chest': { windowCenter: 128, windowWidth: 256, description: 'Chest radiography' },
  'XR_Bone': { windowCenter: 200, windowWidth: 400, description: 'Skeletal imaging' },
  'XR_Soft': { windowCenter: 50, windowWidth: 100, description: 'Soft tissue detail' },
  
  // Mammography
  'MG_Standard': { windowCenter: 128, windowWidth: 256, description: 'Standard mammography' },
  'MG_Dense': { windowCenter: 100, windowWidth: 200, description: 'Dense breast tissue' },
  
  // Ultrasound
  'US_General': { windowCenter: 128, windowWidth: 256, description: 'General ultrasound' },
  'US_Vascular': { windowCenter: 150, windowWidth: 300, description: 'Vascular studies' }
};

// Image processing filters
export const IMAGE_FILTERS = {
  'Sharpen': {
    name: 'Sharpen',
    description: 'Enhance edge definition',
    kernel: [
      [0, -1, 0],
      [-1, 5, -1],
      [0, -1, 0]
    ]
  },
  'Smooth': {
    name: 'Smooth',
    description: 'Reduce noise',
    kernel: [
      [1/9, 1/9, 1/9],
      [1/9, 1/9, 1/9],
      [1/9, 1/9, 1/9]
    ]
  },
  'Edge_Enhance': {
    name: 'Edge Enhancement',
    description: 'Highlight boundaries',
    kernel: [
      [-1, -1, -1],
      [-1, 9, -1],
      [-1, -1, -1]
    ]
  },
  'Emboss': {
    name: 'Emboss',
    description: '3D-like effect',
    kernel: [
      [-2, -1, 0],
      [-1, 1, 1],
      [0, 1, 2]
    ]
  }
};

// Measurement calculation utilities
export class MeasurementCalculator {
  
  /**
   * Calculate distance between two points with pixel spacing
   */
  static calculateDistance(point1, point2, pixelSpacing = [1, 1]) {
    const dx = (point2.x - point1.x) * pixelSpacing[0];
    const dy = (point2.y - point1.y) * pixelSpacing[1];
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Calculate angle between three points
   */
  static calculateAngle(vertex, point1, point2) {
    const v1 = { x: point1.x - vertex.x, y: point1.y - vertex.y };
    const v2 = { x: point2.x - vertex.x, y: point2.y - vertex.y };
    
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    
    const cosAngle = dot / (mag1 * mag2);
    return Math.acos(Math.max(-1, Math.min(1, cosAngle))) * (180 / Math.PI);
  }
  
  /**
   * Calculate area of ellipse
   */
  static calculateEllipseArea(semiMajor, semiMinor, pixelSpacing = [1, 1]) {
    const adjustedMajor = semiMajor * pixelSpacing[0];
    const adjustedMinor = semiMinor * pixelSpacing[1];
    return Math.PI * adjustedMajor * adjustedMinor;
  }
  
  /**
   * Calculate area of polygon
   */
  static calculatePolygonArea(points, pixelSpacing = [1, 1]) {
    let area = 0;
    const n = points.length;
    
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = points[i].x * pixelSpacing[0];
      const yi = points[i].y * pixelSpacing[1];
      const xj = points[j].x * pixelSpacing[0];
      const yj = points[j].y * pixelSpacing[1];
      
      area += xi * yj - xj * yi;
    }
    
    return Math.abs(area) / 2;
  }
  
  /**
   * Calculate volume from area measurements across slices
   */
  static calculateVolume(areas, sliceThickness) {
    return areas.reduce((sum, area) => sum + area, 0) * sliceThickness;
  }
}

// Hounsfield Unit utilities for CT analysis
export class HounsfieldAnalyzer {
  
  static TISSUE_RANGES = {
    'Air': { min: -1000, max: -900, color: '#000000' },
    'Lung': { min: -900, max: -300, color: '#2d3748' },
    'Fat': { min: -300, max: -50, color: '#ffd700' },
    'Water': { min: -50, max: 50, color: '#4299e1' },
    'Soft_Tissue': { min: 50, max: 300, color: '#e53e3e' },
    'Bone': { min: 300, max: 3000, color: '#ffffff' }
  };
  
  /**
   * Classify tissue type based on HU value
   */
  static classifyTissue(huValue) {
    for (const [tissue, range] of Object.entries(this.TISSUE_RANGES)) {
      if (huValue >= range.min && huValue <= range.max) {
        return {
          tissue: tissue.replace('_', ' '),
          range: `${range.min} to ${range.max} HU`,
          color: range.color
        };
      }
    }
    return {
      tissue: 'Unknown',
      range: 'Outside normal range',
      color: '#718096'
    };
  }
  
  /**
   * Calculate HU statistics for ROI
   */
  static calculateROIStatistics(pixelData, rescaleSlope = 1, rescaleIntercept = 0) {
    const huValues = pixelData.map(pixel => pixel * rescaleSlope + rescaleIntercept);
    
    const min = Math.min(...huValues);
    const max = Math.max(...huValues);
    const mean = huValues.reduce((sum, val) => sum + val, 0) / huValues.length;
    
    const variance = huValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / huValues.length;
    const stdDev = Math.sqrt(variance);
    
    return {
      min: Math.round(min),
      max: Math.round(max),
      mean: Math.round(mean),
      stdDev: Math.round(stdDev),
      count: huValues.length,
      tissueClassification: this.classifyTissue(mean)
    };
  }
}

// DICOM metadata extractor
export class DicomMetadataExtractor {
  
  /**
   * Extract comprehensive metadata from DICOM dataset
   */
  static extractMetadata(dataSet) {
    return {
      // Patient Information
      patientName: dataSet.string('x00100010') || 'Unknown',
      patientId: dataSet.string('x00100020') || 'Unknown',
      patientBirthDate: dataSet.string('x00100030') || 'Unknown',
      patientSex: dataSet.string('x00100040') || 'Unknown',
      patientAge: dataSet.string('x00101010') || 'Unknown',
      patientWeight: dataSet.string('x00101030') || 'Unknown',
      
      // Study Information
      studyInstanceUID: dataSet.string('x0020000d') || 'Unknown',
      studyDate: dataSet.string('x00080020') || 'Unknown',
      studyTime: dataSet.string('x00080030') || 'Unknown',
      studyDescription: dataSet.string('x00081030') || 'Unknown',
      accessionNumber: dataSet.string('x00080050') || 'Unknown',
      
      // Series Information
      seriesInstanceUID: dataSet.string('x0020000e') || 'Unknown',
      seriesNumber: dataSet.string('x00200011') || 'Unknown',
      seriesDescription: dataSet.string('x0008103e') || 'Unknown',
      modality: dataSet.string('x00080060') || 'Unknown',
      
      // Image Information
      instanceNumber: dataSet.string('x00200013') || 'Unknown',
      imagePosition: dataSet.string('x00200032') || 'Unknown',
      imageOrientation: dataSet.string('x00200037') || 'Unknown',
      sliceLocation: dataSet.string('x00201041') || 'Unknown',
      sliceThickness: dataSet.string('x00180050') || 'Unknown',
      
      // Acquisition Parameters
      kvp: dataSet.string('x00180060') || 'Unknown',
      exposureTime: dataSet.string('x00181150') || 'Unknown',
      xrayTubeCurrent: dataSet.string('x00181151') || 'Unknown',
      exposureInMas: dataSet.string('x00181152') || 'Unknown',
      
      // Image Characteristics
      rows: dataSet.uint16('x00280010') || 0,
      columns: dataSet.uint16('x00280011') || 0,
      pixelSpacing: dataSet.string('x00280030') || 'Unknown',
      bitsAllocated: dataSet.uint16('x00280100') || 0,
      bitsStored: dataSet.uint16('x00280101') || 0,
      highBit: dataSet.uint16('x00280102') || 0,
      pixelRepresentation: dataSet.uint16('x00280103') || 0,
      
      // Display Parameters
      windowCenter: dataSet.string('x00281050') || 'Unknown',
      windowWidth: dataSet.string('x00281051') || 'Unknown',
      rescaleIntercept: dataSet.string('x00281052') || '0',
      rescaleSlope: dataSet.string('x00281053') || '1',
      
      // Institution Information
      institutionName: dataSet.string('x00080080') || 'Unknown',
      institutionAddress: dataSet.string('x00080081') || 'Unknown',
      stationName: dataSet.string('x00081010') || 'Unknown',
      
      // Equipment Information
      manufacturer: dataSet.string('x00080070') || 'Unknown',
      manufacturerModel: dataSet.string('x00081090') || 'Unknown',
      deviceSerialNumber: dataSet.string('x00181000') || 'Unknown',
      softwareVersions: dataSet.string('x00181020') || 'Unknown'
    };
  }
  
  /**
   * Format metadata for display
   */
  static formatForDisplay(metadata) {
    const sections = {
      'Patient Information': {
        'Name': metadata.patientName,
        'ID': metadata.patientId,
        'Birth Date': metadata.patientBirthDate,
        'Sex': metadata.patientSex,
        'Age': metadata.patientAge,
        'Weight': metadata.patientWeight
      },
      'Study Information': {
        'Study Date': metadata.studyDate,
        'Study Time': metadata.studyTime,
        'Description': metadata.studyDescription,
        'Accession #': metadata.accessionNumber
      },
      'Series Information': {
        'Modality': metadata.modality,
        'Series #': metadata.seriesNumber,
        'Description': metadata.seriesDescription
      },
      'Image Parameters': {
        'Matrix': `${metadata.rows} × ${metadata.columns}`,
        'Pixel Spacing': metadata.pixelSpacing,
        'Slice Thickness': metadata.sliceThickness,
        'Bits Allocated': metadata.bitsAllocated
      },
      'Acquisition': {
        'kVp': metadata.kvp,
        'Exposure Time': metadata.exposureTime,
        'mAs': metadata.exposureInMas,
        'Tube Current': metadata.xrayTubeCurrent
      },
      'Equipment': {
        'Manufacturer': metadata.manufacturer,
        'Model': metadata.manufacturerModel,
        'Station': metadata.stationName,
        'Software': metadata.softwareVersions
      }
    };
    
    return sections;
  }
}

// Image enhancement utilities
export class ImageEnhancer {
  
  /**
   * Apply convolution filter to image data
   */
  static applyFilter(imageData, filter) {
    const { data, width, height } = imageData;
    const output = new Uint8ClampedArray(data.length);
    const kernel = filter.kernel;
    const kernelSize = kernel.length;
    const half = Math.floor(kernelSize / 2);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0;
        
        for (let ky = 0; ky < kernelSize; ky++) {
          for (let kx = 0; kx < kernelSize; kx++) {
            const py = Math.min(height - 1, Math.max(0, y + ky - half));
            const px = Math.min(width - 1, Math.max(0, x + kx - half));
            const idx = (py * width + px) * 4;
            const weight = kernel[ky][kx];
            
            r += data[idx] * weight;
            g += data[idx + 1] * weight;
            b += data[idx + 2] * weight;
          }
        }
        
        const idx = (y * width + x) * 4;
        output[idx] = Math.max(0, Math.min(255, r));
        output[idx + 1] = Math.max(0, Math.min(255, g));
        output[idx + 2] = Math.max(0, Math.min(255, b));
        output[idx + 3] = data[idx + 3]; // Alpha channel
      }
    }
    
    return new ImageData(output, width, height);
  }
  
  /**
   * Adjust brightness and contrast
   */
  static adjustBrightnessContrast(imageData, brightness = 0, contrast = 1) {
    const { data } = imageData;
    
    for (let i = 0; i < data.length; i += 4) {
      // Apply contrast then brightness
      data[i] = Math.max(0, Math.min(255, (data[i] - 128) * contrast + 128 + brightness));
      data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - 128) * contrast + 128 + brightness));
      data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - 128) * contrast + 128 + brightness));
    }
    
    return imageData;
  }
  
  /**
   * Apply gamma correction
   */
  static applyGamma(imageData, gamma = 1.0) {
    const { data } = imageData;
    const gammaCorrection = 1.0 / gamma;
    
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.pow(data[i] / 255, gammaCorrection) * 255;
      data[i + 1] = Math.pow(data[i + 1] / 255, gammaCorrection) * 255;
      data[i + 2] = Math.pow(data[i + 2] / 255, gammaCorrection) * 255;
    }
    
    return imageData;
  }
}

// Export utilities
export class DicomExporter {
  
  /**
   * Export canvas as high-quality image
   */
  static exportAsImage(canvas, format = 'png', quality = 1.0) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        resolve(url);
      }, `image/${format}`, quality);
    });
  }
  
  /**
   * Export measurements as CSV
   */
  static exportMeasurementsAsCSV(measurements) {
    const headers = ['Tool', 'Value', 'Unit', 'Timestamp'];
    const rows = measurements.map(m => [
      m.tool,
      m.data?.cachedStats?.length || m.data?.cachedStats?.angle || m.data?.cachedStats?.area || 'N/A',
      m.tool.includes('Length') ? 'mm' : m.tool.includes('Angle') ? '°' : m.tool.includes('ROI') ? 'mm²' : '',
      new Date(m.timestamp).toLocaleString()
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    return URL.createObjectURL(blob);
  }
  
  /**
   * Export DICOM metadata as JSON
   */
  static exportMetadataAsJSON(metadata) {
    const jsonContent = JSON.stringify(metadata, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    return URL.createObjectURL(blob);
  }
}