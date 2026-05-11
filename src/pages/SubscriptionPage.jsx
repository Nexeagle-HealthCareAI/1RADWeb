import React, { useState } from 'react';

const SubscriptionPage = () => {
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' or 'yearly'

  const plans = [
    {
      name: 'Starter Trial',
      price: '0',
      duration: '15 Days',
      description: 'Experience the full power of 1Rad with no strings attached.',
      features: [
        'Full Reporting Engine',
        'Appointment Management',
        'DICOM Viewer Access',
        '24/7 Support',
        'Unlimited Patients (Trial)'
      ],
      icon: '⏳',
      buttonText: 'Start Free Trial',
      highlight: false,
      tag: 'TRIAL'
    },
    {
      name: 'Professional',
      price: billingCycle === 'monthly' ? '4,999' : '4,499',
      duration: billingCycle === 'monthly' ? '/ month' : '/ month, billed yearly',
      description: 'Perfect for established radiology centers and clinics.',
      features: [
        'Advanced Clinical Analytics',
        'Custom Letterhead Branding',
        'Voice Reporting Support',
        'Multi-Facility Sync',
        'Included: 1 Doctor seat',
        'Additional: ₹1,000 / doctor'
      ],
      icon: '🚀',
      buttonText: 'Upgrade Now',
      highlight: true,
      tag: 'POPULAR'
    }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white py-20 px-4 relative overflow-hidden">
      {/* Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600 bg-opacity-10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600 bg-opacity-10 rounded-full blur-[120px]" />

      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            Scale Your Radiology Practice
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Choose the plan that fits your facility's needs. All plans include our core 1Rad Diagnostic Suite.
          </p>

          {/* Billing Toggle */}
          <div className="mt-10 flex items-center justify-center gap-4">
            <span className={`text-sm ${billingCycle === 'monthly' ? 'text-white' : 'text-gray-500'}`}>Monthly</span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className="w-14 h-7 bg-gray-800 rounded-full p-1 transition-all duration-300 relative border border-gray-700"
            >
              <div className={`w-5 h-5 bg-blue-500 rounded-full transition-all duration-300 ${billingCycle === 'yearly' ? 'translate-x-7' : 'translate-x-0'}`} />
            </button>
            <span className={`text-sm flex items-center gap-2 ${billingCycle === 'yearly' ? 'text-white' : 'text-gray-500'}`}>
              Yearly
              <span className="bg-green-500 bg-opacity-20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-500 border-opacity-30">
                SAVE 10%
              </span>
            </span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`relative p-8 rounded-3xl border transition-all duration-500 group hover:scale-[1.02] ${
                plan.highlight
                  ? 'bg-gradient-to-b from-gray-900 to-blue-900 bg-opacity-80 border-blue-500 border-opacity-50 shadow-xl'
                  : 'bg-gray-900 bg-opacity-40 border-gray-800 hover:border-gray-700'
              } backdrop-blur-xl`}
            >
              {plan.tag && (
                <span className={`absolute top-4 right-4 text-[10px] font-black tracking-widest px-3 py-1 rounded-full ${
                  plan.highlight ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400'
                }`}>
                  {plan.tag}
                </span>
              )}

              <div className="mb-8">
                <div className={`w-12 h-12 rounded-2xl mb-4 flex items-center justify-center text-2xl ${
                  plan.highlight ? 'bg-blue-500 bg-opacity-10' : 'bg-gray-800 bg-opacity-50'
                }`}>
                  {plan.icon}
                </div>
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{plan.description}</p>
              </div>

              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black">₹{plan.price}</span>
                  <span className="text-gray-500 text-sm">{plan.duration}</span>
                </div>
              </div>

              <ul className="space-y-4 mb-10">
                {plan.features.map((feature, fIdx) => (
                  <li key={fIdx} className="flex items-start gap-3 text-sm text-gray-300">
                    <span className={`shrink-0 ${plan.highlight ? 'text-blue-400' : 'text-gray-500'}`}>✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <button className={`w-full py-4 rounded-2xl font-bold transition-all duration-300 ${
                plan.highlight
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-lg text-white'
                  : 'bg-white bg-opacity-10 hover:bg-white bg-opacity-20 text-white border border-white border-opacity-10'
              }`}>
                {plan.buttonText}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing Footnotes */}
      <div className="max-w-4xl mx-auto mt-16 p-6 rounded-2xl bg-gray-900 bg-opacity-20 border border-gray-800 border-opacity-50 backdrop-blur-md">
        <h4 className="text-sm font-bold text-gray-300 mb-4 flex items-center gap-2">
          <span>🛡️</span>
          Subscription Protocol & Guidelines
        </h4>
        <ul className="grid md:grid-cols-2 gap-4 text-xs text-gray-500">
          <li className="flex items-start gap-2">
            <span className="text-blue-500">•</span>
            <span>Base price includes 1 Doctor seat. Additional doctors are billed at ₹1,000/month each.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500">•</span>
            <span>Subscriptions are facility-specific. New branches require a separate active protocol.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500">•</span>
            <span>15-day trial period is applicable per new branch registration.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500">•</span>
            <span>All prices are exclusive of applicable taxes.</span>
          </li>
        </ul>
      </div>

      {/* Security & Support Badges */}
      <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 text-center max-w-5xl mx-auto border-t border-gray-800 border-opacity-50 pt-16">
        <div className="flex flex-col items-center gap-2">
          <span className="text-2xl opacity-50">🛡️</span>
          <span className="text-xs text-gray-500 font-medium">Enterprise Security</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-2xl opacity-50">⚡</span>
          <span className="text-xs text-gray-500 font-medium">Ultra-Fast Sync</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-2xl opacity-50">🕒</span>
          <span className="text-xs text-gray-500 font-medium">24/7 Live Support</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-2xl opacity-50">🚀</span>
          <span className="text-xs text-gray-500 font-medium">Instant Deployment</span>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPage;
