//@@IMPORTS@@
//
// The harness writes one file per expectation case:
//
//   [the student's `import` lines, hoisted to the top because Java requires
//    imports to precede every type declaration]
//   [this driver's imports]
//   [the student's code, verbatim from lesson.code.java]
//   [this Runner class, LAST]
//
// Two ordering constraints fall out of this and both are load-bearing:
// Java requires imports before any type, and a JEP 330 in-memory launch
// attributes classes in source order — so a class declared *after* Runner
// cannot be referenced from it. Hence: all imports, then the student's types,
// then Runner.
//
// Runner binds the student's class with a compile-time reference
// (`BubbleSort.class`) rather than `Class.forName`, so a wrong class name is a
// compile error with a clear message instead of a runtime throw.
//
// Reflection is still used for the method itself, so the driver compiles
// without knowing the student's parameter types in advance. `coerce` converts
// each JSON argument into whatever type the target method declares — that is
// what lets one driver verify every Java implementation with no per-algorithm
// boilerplate.

import java.io.IOException;
import java.lang.reflect.Array;
import java.lang.reflect.Method;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

//@@CODE@@

class Runner {

    // Replaced by the harness with a direct reference to the student's class,
    // e.g. `Class<?> VERIFY_TARGET = BubbleSort.class;`. Compile-time reference
    // rather than Class.forName, because a JEP 330 in-memory launch only
    // guarantees the *first* class in the file is loadable by name.
    static Class<?> VERIFY_TARGET = Object.class;

    // ------------------------------ JSON in ------------------------------

    static Object parse(String s) {
        P p = new P(s);
        p.ws();
        Object v = p.value();
        return v;
    }

    static class P {
        final String s;
        int i = 0;

        P(String s) { this.s = s; }

        void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }

        RuntimeException bad(String m) { return new RuntimeException("bad JSON at " + i + ": " + m); }

        Object value() {
            ws();
            if (i >= s.length()) throw bad("unexpected end");
            char c = s.charAt(i);
            if (c == '{') return obj();
            if (c == '[') return arr();
            if (c == '"') return str();
            if (s.startsWith("true", i)) { i += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i)) { i += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i)) { i += 4; return null; }
            return num();
        }

        String str() {
            StringBuilder o = new StringBuilder();
            i++;
            while (i < s.length() && s.charAt(i) != '"') {
                char c = s.charAt(i++);
                if (c == '\\' && i < s.length()) {
                    char e = s.charAt(i++);
                    if (e == 'u') { o.append('?'); i += 4; }
                    else if (e == 'n') o.append('\n');
                    else if (e == 't') o.append('\t');
                    else if (e == 'r') o.append('\r');
                    else o.append(e);
                } else {
                    o.append(c);
                }
            }
            i++;
            return o.toString();
        }

        Object num() {
            int st = i;
            while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
            String t = s.substring(st, i);
            if (t.isEmpty()) throw bad("expected number");
            if (t.contains(".") || t.contains("e") || t.contains("E")) return Double.valueOf(t);
            return Long.valueOf(t);
        }

        List<Object> arr() {
            List<Object> out = new ArrayList<>();
            i++;
            ws();
            if (i < s.length() && s.charAt(i) == ']') { i++; return out; }
            while (true) {
                out.add(value());
                ws();
                if (i >= s.length()) throw bad("unterminated array");
                char c = s.charAt(i++);
                if (c == ']') return out;
                if (c != ',') throw bad("expected , or ]");
            }
        }

        Map<String, Object> obj() {
            Map<String, Object> out = new LinkedHashMap<>();
            i++;
            ws();
            if (i < s.length() && s.charAt(i) == '}') { i++; return out; }
            while (true) {
                ws();
                if (i >= s.length() || s.charAt(i) != '"') throw bad("expected key");
                String k = str();
                ws();
                if (i >= s.length() || s.charAt(i) != ':') throw bad("expected :");
                i++;
                out.put(k, value());
                ws();
                if (i >= s.length()) throw bad("unterminated object");
                char c = s.charAt(i++);
                if (c == '}') return out;
                if (c != ',') throw bad("expected , or }");
            }
        }
    }

    // -------------------------- JSON -> declared type --------------------------

    /**
     * Convert one JSON value into an instance of `target`.
     *
     * `generic` is the element type when `target` is a List/Set/Map, taken from
     * the method's generic parameter type. This is what makes
     * `List<List<int[]>> adj` work with no declaration anywhere.
     */
    static Object coerce(Object v, Class<?> target, Type generic) {
        if (v == null) return null;

        if (target == int.class || target == Integer.class) {
            return Integer.valueOf((int) num(v));
        }
        if (target == long.class || target == Long.class) return Long.valueOf((long) num(v));
        if (target == double.class || target == Double.class) return Double.valueOf(num(v));
        if (target == float.class || target == Float.class) return Float.valueOf((float) num(v));
        if (target == short.class || target == Short.class) return Short.valueOf((short) num(v));
        if (target == byte.class || target == Byte.class) return Byte.valueOf((byte) num(v));
        if (target == char.class || target == Character.class) {
            String s = String.valueOf(v);
            return Character.valueOf(s.isEmpty() ? ' ' : s.charAt(0));
        }
        if (target == boolean.class || target == Boolean.class) {
            if (v instanceof Boolean) return v;
            return Boolean.valueOf(num(v) != 0);
        }
        if (target == String.class) return String.valueOf(v);

        if (target.isArray()) {
            List<?> src = (List<?>) v;
            Class<?> comp = target.getComponentType();
            Object out = Array.newInstance(comp, src.size());
            for (int k = 0; k < src.size(); k++) {
                Array.set(out, k, coerce(src.get(k), comp, null));
            }
            return out;
        }

        if (target == List.class) {
            Class<?> elem = rawOrObject(generic);
            List<Object> out = new ArrayList<>();
            for (Object o : (List<?>) v) out.add(coerce(o, elem, argOf(generic, 0)));
            return out;
        }
        if (target == Set.class) {
            Class<?> elem = rawOrObject(generic);
            Set<Object> out = new LinkedHashSet<>();
            for (Object o : (List<?>) v) out.add(coerce(o, elem, argOf(generic, 0)));
            return out;
        }
        if (target == Map.class) {
            Map<String, Object> out = new LinkedHashMap<>();
            Class<?> vt = argOf(generic, 1) == null ? Object.class : rawOrObject(argOf(generic, 1));
            for (Map.Entry<String, Object> e : ((Map<String, Object>) v).entrySet()) {
                out.put(e.getKey(), coerce(e.getValue(), vt, argOf(generic, 1)));
            }
            return out;
        }

        if (target == Object.class) return v;
        throw new RuntimeException("verify: no coercion for " + target.getName());
    }

    static double num(Object v) {
        if (v instanceof Number) return ((Number) v).doubleValue();
        if (v instanceof Boolean) return ((Boolean) v) ? 1 : 0;
        return Double.parseDouble(String.valueOf(v));
    }

    static Type argOf(Type t, int idx) {
        if (t instanceof ParameterizedType p) {
            Type[] a = p.getActualTypeArguments();
            return idx < a.length ? a[idx] : null;
        }
        return null;
    }

    static Class<?> rawOrObject(Type t) {
        if (t instanceof Class<?> c) return c;
        if (t instanceof ParameterizedType p && p.getRawType() instanceof Class<?> c) return c;
        return Object.class;
    }

    /**
     * The `graph` glue: {"nodes":[...], "edges":[[u,v,w], ...]} becomes an
     * adjacency list `List<List<int[]>>`, so a BFS does not have to re-scan the
     * whole edge list on every pop (which would be a different, worse algorithm).
     */
    @SuppressWarnings("unchecked")
    static List<List<int[]>> toAdjacency(Map<String, Object> g) {
        List<?> nodes = (List<?>) g.get("nodes");
        List<?> edges = (List<?>) g.get("edges");
        List<List<int[]>> adj = new ArrayList<>();
        for (int u = 0; u < nodes.size(); u++) adj.add(new ArrayList<int[]>());
        for (Object o : edges) {
            List<?> t = (List<?>) o;
            int u = (int) num(t.get(0));
            int v = (int) num(t.get(1));
            int w = t.size() > 2 ? (int) num(t.get(2)) : 1;
            if (u >= 0 && u < adj.size()) adj.get(u).add(new int[] { v, w });
        }
        return adj;
    }

    // -------------------------- Java result -> JSON --------------------------

    static String esc(String s) {
        StringBuilder o = new StringBuilder();
        for (int k = 0; k < s.length(); k++) {
            char c = s.charAt(k);
            if (c == '"' || c == '\\') { o.append('\\').append(c); }
            else if (c == '\n') o.append("\\n");
            else if (c == '\r') o.append("\\r");
            else if (c == '\t') o.append("\\t");
            else o.append(c);
        }
        return o.toString();
    }

    static void write(Appendable o, Object v) throws IOException {
        if (v == null) { o.append("null"); return; }
        if (v instanceof String) { o.append('"').append(esc((String) v)).append('"'); return; }
        if (v instanceof Boolean) { o.append(v.toString()); return; }
        if (v instanceof Double || v instanceof Float) {
            double d = ((Number) v).doubleValue();
            if (d == Math.rint(d) && !Double.isInfinite(d)) o.append(Long.toString((long) d));
            else o.append(Double.toString(d));
            return;
        }
        if (v instanceof Number) { o.append(v.toString()); return; }
        if (v instanceof Character) { o.append('"').append(esc(v.toString())).append('"'); return; }
        if (v.getClass().isArray()) {
            o.append('[');
            int n = Array.getLength(v);
            for (int k = 0; k < n; k++) {
                if (k > 0) o.append(',');
                write(o, Array.get(v, k));
            }
            o.append(']');
            return;
        }
        if (v instanceof Iterable) {
            o.append('[');
            boolean first = true;
            for (Object e : (Iterable<?>) v) {
                if (!first) o.append(',');
                first = false;
                write(o, e);
            }
            o.append(']');
            return;
        }
        if (v instanceof Map) {
            o.append('{');
            boolean first = true;
            for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) {
                if (!first) o.append(',');
                first = false;
                o.append('"').append(esc(String.valueOf(e.getKey()))).append("\":");
                write(o, e.getValue());
            }
            o.append('}');
            return;
        }
        o.append('"').append(esc(String.valueOf(v))).append('"');
    }

    // --------------------------------- main ---------------------------------

    @SuppressWarnings("unchecked")
    public static void main(String[] argv) throws Exception {
        String spec;
        try {
            spec = new String(Files.readAllBytes(Paths.get("input.json")));
        } catch (Exception e) {
            Files.write(Paths.get("output.json"),
                "{\"ok\":false,\"error\":\"input.json not found\"}".getBytes());
            System.exit(1);
            return;
        }

        StringBuilder out = new StringBuilder();
        try {
            Map<String, Object> specMap = (Map<String, Object>) parse(spec);
            String methodName = (String) specMap.get("entryMethod");
            String glue = String.valueOf(specMap.getOrDefault("glue", "auto"));
            List<Object> args = (List<Object>) specMap.get("args");

            Class<?> target = VERIFY_TARGET;
            Method found = null;
            for (Method m : target.getDeclaredMethods()) {
                if (m.getName().equals(methodName)) { found = m; break; }
            }
            if (found == null) {
                for (Method m : target.getMethods()) {
                    if (m.getName().equals(methodName)) { found = m; break; }
                }
            }
            if (found == null) {
                throw new RuntimeException("no method '" + methodName + "' on " + target.getName());
            }
            found.setAccessible(true);

            Class<?>[] types = found.getParameterTypes();
            Type[] generics = found.getGenericParameterTypes();
            Object[] call = new Object[types.length];
            for (int k = 0; k < types.length; k++) {
                Object v = k < args.size() ? args.get(k) : null;
                if (glue.equals("graph") && v instanceof Map && k == 0) {
                    call[k] = toAdjacency((Map<String, Object>) v);
                } else {
                    call[k] = coerce(v, types[k], generics[k]);
                }
            }

            Object result = found.invoke(null, call);
            out.append("{\"ok\":true,\"value\":");
            write(out, result);
            out.append('}');
        } catch (Throwable t) {
            Throwable cause = t.getCause() != null ? t.getCause() : t;
            out.setLength(0);
            out.append("{\"ok\":false,\"error\":\"")
               .append(esc(cause.getClass().getSimpleName() + ": " + String.valueOf(cause.getMessage())))
               .append("\"}");
        }
        Files.write(Paths.get("output.json"), out.toString().getBytes());
    }
}
