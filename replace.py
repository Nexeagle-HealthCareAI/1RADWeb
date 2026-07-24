import sys

with open('src/components/Billing/Drawers/PayoutDrawer.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    '''<div className="drawer-overlay" onClick={() => setIsPayoutDrawerOpen(false)} style={{ backdropFilter: 'blur(8px)', background: 'rgba(10, 22, 40, 0.4)', zIndex: 10000 }}>''',
    '''<div className="drawer-overlay" onClick={() => setIsPayoutDrawerOpen(false)} style={{ backdropFilter: 'blur(4px)', background: 'rgba(10, 22, 40, 0.45)', zIndex: 10000, justifyContent: 'flex-end', alignItems: 'stretch', padding: 0 }}>'''
)

content = content.replace(
    '''<div className="drawer-content" style={{ padding: 0, width: isMobile ? '100%' : '480px', maxWidth: '100vw', background: 'white' }} onClick={e => e.stopPropagation()}>''',
    '''<div className="drawer-content" style={{ padding: 0, width: isMobile ? '100%' : '480px', maxWidth: '100vw', background: 'white', height: '100vh', borderRadius: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', margin: 0 }} onClick={e => e.stopPropagation()}>'''
)

content = content.replace(
    '''<div style={{ padding: isMobile ? '20px' : '35px' }}>
           <form onSubmit={handleSavePayout}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>''',
    '''<div style={{ padding: isMobile ? '20px' : '35px', flex: 1, display: 'flex', flexDirection: 'column' }}>
           <form onSubmit={handleSavePayout} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', flex: 1 }}>'''
)

content = content.replace(
    '''<div style={{ marginTop: isMobile ? '28px' : '40px', display: 'flex', gap: '12px' }}>
                 <button type="button" onClick={() => setIsPayoutDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>CANCEL</button>
                 <button type="submit" disabled={isSavingPayout} style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer' }}>
                   {isSavingPayout ? 'SENDING...' : isApprovalEdit ? 'SEND FOR APPROVAL →' : 'AUTHORIZE DISBURSEMENT →'}
                 </button>
              </div>''',
    '''<div style={{ marginTop: isMobile ? '28px' : '40px', display: 'flex', gap: '12px', paddingBottom: '20px' }}>
                 <button type="button" onClick={() => setIsPayoutDrawerOpen(false)} style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #eee', fontSize: '11px', fontWeight: 950, cursor: 'pointer', background: 'white' }}>CANCEL</button>
                 <button type="submit" disabled={isSavingPayout} style={{ flex: 2, padding: '16px', borderRadius: '16px', border: 'none', background: '#0f52ba', color: 'white', fontSize: '11px', fontWeight: 950, cursor: 'pointer', boxShadow: '0 4px 12px rgba(15,82,186,0.3)' }}>
                   {isSavingPayout ? 'SENDING...' : isApprovalEdit ? 'SEND FOR APPROVAL →' : 'AUTHORIZE DISBURSEMENT →'}
                 </button>
              </div>'''
)

with open('src/components/Billing/Drawers/PayoutDrawer.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
