import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal
} from 'react-native';
import { useAppointments } from '../context/AppointmentContext';
import { COLORS, SPACING, RADIUS, SHADOWS } from '../theme/TacticalTheme';
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  FileText,
  ChevronDown,
  Check,
  AlertTriangle
} from 'lucide-react-native';

export default function CreateAppointmentScreen({ navigation }) {
  const { createAppointment, patients, doctors } = useAppointments();
  
  const [formData, setFormData] = useState({
    patientId: '',
    patientName: '',
    type: '',
    date: '',
    time: '',
    priority: 'medium',
    notes: '',
    doctor: '',
    department: ''
  });

  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [showDoctorPicker, setShowDoctorPicker] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const appointmentTypes = [
    'Consultation',
    'Diagnostic Scan',
    'Surgery Prep',
    'Follow-up',
    'Emergency',
    'Routine Checkup',
    'Lab Work',
    'Therapy Session'
  ];

  const priorities = [
    { value: 'low', label: 'LOW', color: COLORS.textSecondary },
    { value: 'medium', label: 'MEDIUM', color: COLORS.cyan },
    { value: 'high', label: 'HIGH', color: COLORS.gold },
    { value: 'urgent', label: 'URGENT', color: COLORS.error }
  ];

  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePatientSelect = (patient) => {
    updateFormData('patientId', patient.id);
    updateFormData('patientName', patient.name);
    setShowPatientPicker(false);
  };

  const handleDoctorSelect = (doctor) => {
    updateFormData('doctor', doctor.name);
    updateFormData('department', doctor.department);
    setShowDoctorPicker(false);
  };

  const validateForm = () => {
    const required = ['patientId', 'type', 'date', 'time', 'doctor'];
    const missing = required.filter(field => !formData[field]);
    
    if (missing.length > 0) {
      Alert.alert('VALIDATION ERROR', 'Please fill in all required fields');
      return false;
    }

    // Validate date is not in the past
    const appointmentDate = new Date(formData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (appointmentDate < today) {
      Alert.alert('INVALID DATE', 'Appointment date cannot be in the past');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const result = await createAppointment(formData);
      if (result.success) {
        Alert.alert(
          'SUCCESS',
          'Appointment created successfully',
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      }
    } catch (error) {
      Alert.alert('ERROR', 'Failed to create appointment');
    } finally {
      setLoading(false);
    }
  };

  const PickerModal = ({ visible, onClose, title, data, onSelect, renderItem }) => (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalList}>
            {data.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.modalItem}
                onPress={() => onSelect(item)}
              >
                {renderItem(item)}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const FormField = ({ label, required, children }) => (
    <View style={styles.formField}>
      <Text style={styles.fieldLabel}>
        {label} {required && <Text style={styles.required}>*</Text>}
      </Text>
      {children}
    </View>
  );

  const SelectButton = ({ placeholder, value, onPress, icon: Icon }) => (
    <TouchableOpacity style={styles.selectButton} onPress={onPress}>
      <View style={styles.selectContent}>
        {Icon && <Icon size={16} color={COLORS.textSecondary} />}
        <Text style={[
          styles.selectText,
          !value && styles.selectPlaceholder
        ]}>
          {value || placeholder}
        </Text>
      </View>
      <ChevronDown size={16} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={COLORS.cyan} />
        </TouchableOpacity>
        <Text style={styles.title}>CREATE APPOINTMENT</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        {/* Patient Selection */}
        <FormField label="PATIENT" required>
          <SelectButton
            placeholder="Select patient..."
            value={formData.patientName}
            onPress={() => setShowPatientPicker(true)}
            icon={User}
          />
        </FormField>

        {/* Appointment Type */}
        <FormField label="APPOINTMENT TYPE" required>
          <SelectButton
            placeholder="Select type..."
            value={formData.type}
            onPress={() => setShowTypePicker(true)}
            icon={FileText}
          />
        </FormField>

        {/* Date & Time */}
        <View style={styles.dateTimeRow}>
          <View style={[styles.formField, { flex: 1, marginRight: SPACING.sm }]}>
            <Text style={styles.fieldLabel}>
              DATE <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.inputContainer}>
              <Calendar size={16} color={COLORS.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textSecondary}
                value={formData.date}
                onChangeText={(value) => updateFormData('date', value)}
              />
            </View>
          </View>
          
          <View style={[styles.formField, { flex: 1, marginLeft: SPACING.sm }]}>
            <Text style={styles.fieldLabel}>
              TIME <Text style={styles.required}>*</Text>
            </Text>
            <View style={styles.inputContainer}>
              <Clock size={16} color={COLORS.textSecondary} />
              <TextInput
                style={styles.input}
                placeholder="HH:MM"
                placeholderTextColor={COLORS.textSecondary}
                value={formData.time}
                onChangeText={(value) => updateFormData('time', value)}
              />
            </View>
          </View>
        </View>

        {/* Doctor Selection */}
        <FormField label="DOCTOR" required>
          <SelectButton
            placeholder="Select doctor..."
            value={formData.doctor ? `${formData.doctor} • ${formData.department}` : ''}
            onPress={() => setShowDoctorPicker(true)}
            icon={User}
          />
        </FormField>

        {/* Priority */}
        <FormField label="PRIORITY">
          <SelectButton
            placeholder="Select priority..."
            value={formData.priority ? priorities.find(p => p.value === formData.priority)?.label : ''}
            onPress={() => setShowPriorityPicker(true)}
            icon={AlertTriangle}
          />
        </FormField>

        {/* Notes */}
        <FormField label="NOTES">
          <View style={styles.textAreaContainer}>
            <TextInput
              style={styles.textArea}
              placeholder="Additional notes or instructions..."
              placeholderTextColor={COLORS.textSecondary}
              value={formData.notes}
              onChangeText={(value) => updateFormData('notes', value)}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </FormField>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'CREATING...' : 'CREATE APPOINTMENT'}
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Patient Picker Modal */}
      <PickerModal
        visible={showPatientPicker}
        onClose={() => setShowPatientPicker(false)}
        title="SELECT PATIENT"
        data={patients}
        onSelect={handlePatientSelect}
        renderItem={(patient) => (
          <View>
            <Text style={styles.modalItemTitle}>{patient.name}</Text>
            <Text style={styles.modalItemSubtitle}>ID: {patient.id} • {patient.phone}</Text>
          </View>
        )}
      />

      {/* Doctor Picker Modal */}
      <PickerModal
        visible={showDoctorPicker}
        onClose={() => setShowDoctorPicker(false)}
        title="SELECT DOCTOR"
        data={doctors}
        onSelect={handleDoctorSelect}
        renderItem={(doctor) => (
          <View>
            <Text style={styles.modalItemTitle}>{doctor.name}</Text>
            <Text style={styles.modalItemSubtitle}>{doctor.department} • {doctor.specialization}</Text>
          </View>
        )}
      />

      {/* Type Picker Modal */}
      <PickerModal
        visible={showTypePicker}
        onClose={() => setShowTypePicker(false)}
        title="SELECT TYPE"
        data={appointmentTypes}
        onSelect={(type) => {
          updateFormData('type', type);
          setShowTypePicker(false);
        }}
        renderItem={(type) => (
          <Text style={styles.modalItemTitle}>{type}</Text>
        )}
      />

      {/* Priority Picker Modal */}
      <PickerModal
        visible={showPriorityPicker}
        onClose={() => setShowPriorityPicker(false)}
        title="SELECT PRIORITY"
        data={priorities}
        onSelect={(priority) => {
          updateFormData('priority', priority.value);
          setShowPriorityPicker(false);
        }}
        renderItem={(priority) => (
          <Text style={[styles.modalItemTitle, { color: priority.color }]}>
            {priority.label}
          </Text>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgMain,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  form: {
    flex: 1,
    padding: SPACING.lg,
  },
  formField: {
    marginBottom: SPACING.lg,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.cyan,
    letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  required: {
    color: COLORS.error,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  input: {
    flex: 1,
    marginLeft: SPACING.sm,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  textAreaContainer: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  textArea: {
    color: COLORS.textPrimary,
    fontSize: 14,
    minHeight: 80,
  },
  dateTimeRow: {
    flexDirection: 'row',
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  selectContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectText: {
    marginLeft: SPACING.sm,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  selectPlaceholder: {
    color: COLORS.textSecondary,
  },
  submitButton: {
    backgroundColor: COLORS.cyan,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
    ...SHADOWS.cyan,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: COLORS.bgMain,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  modalClose: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  modalList: {
    flex: 1,
  },
  modalItem: {
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  modalItemSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});