import { ImageResponse } from 'next/og';

export const alt = 'Ravelyth Talent — connecting great people with great opportunities';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          backgroundColor: '#0b1220',
          padding: '72px 76px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 18,
              backgroundColor: '#0b1220',
              border: '3px solid #2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ position: 'relative', width: 56, height: 56, display: 'flex' }}>
              <div style={{ width: 56, height: 56, borderRadius: 28, border: '4px solid #38BDF8' }} />
              <div style={{ position: 'absolute', top: 27, left: 0, width: 56, height: 2, backgroundColor: '#60A5FA' }} />
              <div style={{ position: 'absolute', top: 0, left: 27, width: 2, height: 56, backgroundColor: '#2563EB' }} />
              <div
                style={{
                  position: 'absolute',
                  top: 23,
                  left: 23,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: '#7DD3FC',
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginLeft: 24 }}>
            <div style={{ fontSize: 52, fontWeight: 700, color: '#F8FAFC', lineHeight: 1.1 }}>Ravelyth</div>
            <div style={{ fontSize: 26, color: '#38BDF8', marginTop: 8 }}>Connecting great people with great opportunities</div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            fontSize: 54,
            fontWeight: 700,
            color: '#F8FAFC',
            marginTop: 44,
            lineHeight: 1.15,
          }}
        >
          <div>Great Roles, Real People,</div>
          <div>Stronger Futures.</div>
        </div>
        <div style={{ fontSize: 28, color: '#94A3B8', marginTop: 20 }}>
          Browse live vacancies, build a profile and resume, apply in one click, and hire with recruiter plans.
        </div>
        <div style={{ fontSize: 22, color: '#60A5FA', marginTop: 28 }}>
          Right People | Better Opportunities | Stronger Tomorrow
        </div>
      </div>
    ),
    size
  );
}