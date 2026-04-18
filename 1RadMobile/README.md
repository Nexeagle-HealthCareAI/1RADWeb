# 1Rad Mobile - Clinical Command Mobile App

A tactical-themed React Native mobile application for managing medical appointments and administrative tasks.

## Features

### 🎯 Core Functionality
- **Authentication System**: Secure login with password and OTP verification
- **Dashboard**: Real-time overview of appointments and system status
- **Appointment Management**: Full CRUD operations for medical appointments
- **Admin Board**: Administrative control panel for system oversight

### 📱 Appointment Management
- **Create Appointments**: Schedule new patient appointments with detailed information
- **Edit Appointments**: Modify existing appointment details and status
- **View Appointments**: List and filter appointments by status, date, and priority
- **Status Management**: Track appointment states (scheduled, confirmed, pending, cancelled)
- **Priority System**: Categorize appointments by urgency (low, medium, high, urgent)

### 🛡️ Admin Board
- **System Overview**: Monitor operational status and performance metrics
- **User Management**: Administrative controls for user access
- **Analytics Dashboard**: View appointment statistics and trends
- **Quick Actions**: Rapid access to administrative functions
- **Activity Monitoring**: Track recent system activities and changes

### 🎨 UI/UX Features
- **Tactical Theme**: Military-inspired dark theme with cyan accents
- **Drawer Navigation**: Intuitive side navigation menu
- **Status Indicators**: Visual badges for appointment status and priority
- **Responsive Design**: Optimized for mobile devices
- **Glass Morphism**: Modern UI effects with transparency and blur

## Technology Stack

- **React Native**: Cross-platform mobile development
- **Expo**: Development platform and build tools
- **React Navigation**: Navigation library with drawer and stack navigators
- **Lucide React Native**: Icon library for consistent iconography
- **Context API**: State management for authentication and appointments

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── StatusBadge.js   # Status indicator component
│   └── PriorityIndicator.js # Priority level component
├── context/             # React Context providers
│   ├── AuthContext.js   # Authentication state management
│   └── AppointmentContext.js # Appointment data management
├── navigation/          # Navigation configuration
│   └── AppNavigator.js  # Main navigation setup
├── screens/             # Application screens
│   ├── SplashScreen.js
│   ├── LoginScreen.js
│   ├── RegisterScreen.js
│   ├── DashboardScreen.js
│   ├── AppointmentsScreen.js
│   ├── CreateAppointmentScreen.js
│   ├── EditAppointmentScreen.js
│   └── AdminBoardScreen.js
└── theme/               # Design system
    └── TacticalTheme.js # Colors, spacing, and styling constants
```

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- Expo CLI
- Android Studio (for Android development)
- Xcode (for iOS development, macOS only)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd 1RadMobile
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Run on device/simulator:
- Press `a` for Android
- Press `i` for iOS
- Scan QR code with Expo Go app

## Authentication

### Default Credentials
- **Admin Access**: Any identifier with password `admin123`
- **OTP Verification**: Use code `123456` for development

### User Roles
- **Administrator**: Full access to all features including Admin Board
- **Operator**: Access to appointments and dashboard (Admin Board restricted)

## Appointment System

### Appointment Status Flow
1. **Scheduled**: Initial appointment creation
2. **Confirmed**: Patient confirmation received
3. **Pending**: Awaiting confirmation or additional information
4. **Cancelled**: Appointment cancelled by patient or system

### Priority Levels
- **Low**: Routine appointments
- **Medium**: Standard priority (default)
- **High**: Important appointments requiring attention
- **Urgent**: Critical cases requiring immediate attention

## Admin Features

### System Monitoring
- Real-time appointment statistics
- User activity tracking
- System performance metrics
- Operational status indicators

### Quick Actions
- System status monitoring
- User management access
- Analytics and reporting
- Configuration settings

## Development

### Adding New Features
1. Create new screens in `src/screens/`
2. Add navigation routes in `src/navigation/AppNavigator.js`
3. Update context providers for state management
4. Follow the tactical theme design system

### Styling Guidelines
- Use `TacticalTheme.js` constants for colors and spacing
- Follow military/tactical naming conventions
- Maintain dark theme with cyan accents
- Use glass morphism effects for cards and modals

## Build and Deployment

### Development Build
```bash
expo build:android
expo build:ios
```

### Production Build
```bash
expo build:android --type app-bundle
expo build:ios --type archive
```

## Contributing

1. Follow the established code structure
2. Maintain the tactical theme consistency
3. Add proper error handling and validation
4. Update documentation for new features
5. Test on both Android and iOS platforms

## License

This project is proprietary software for 1Rad Clinical Command System.