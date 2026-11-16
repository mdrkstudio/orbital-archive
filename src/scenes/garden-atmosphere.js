// Shared water color keeps distant surfaces continuous with the empty channel.
export const gardenAtmosphereGLSL = `
  vec3 gardenWaterColor(vec2 uv, float time) {
    float cone=exp(-pow((uv.x-.49)*3.4,2.));
    float top=pow(clamp(uv.y,0.,1.),4.4);
    float a=uv.x+(1.-uv.y)*.065;
    float shafts=pow(.5+.5*sin(a*38.+sin(a*13.)+time*.022),7.);
    float fine=pow(.5+.5*sin(a*71.-uv.y*.8),15.);
    vec3 water=mix(vec3(.0001,.004,.0045),vec3(.0001,.095,.105),top*cone);
    water+=vec3(.0001,.11,.105)*(shafts+fine*.22)*cone*(.12+top*.88);
    water+=vec3(0.,.20,.20)*pow(clamp(uv.y,0.,1.),12.)*exp(-pow((uv.x-.48)*6.,2.));
    return water;
  }
  float gardenTransmission(float depth) {
    return exp(-max(0.,depth-16.)*.033);
  }
`;
