import { Eye, EyeOff } from "lucide-react";
import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const { className, disabled, ...inputProps } = props;

  return (
    <span className="password-input-shell">
      <input
        {...inputProps}
        disabled={disabled}
        type={visible ? "text" : "password"}
        className={`text-input password-input-control ${className ?? ""}`}
      />
      <button
        type="button"
        className="password-input-toggle"
        disabled={disabled}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
      </button>
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const fieldId = useId();
  const labelId = `${fieldId}-label`;
  const helpId = `${fieldId}-help`;
  const helpText = error || hint;
  const describedBy = helpText ? helpId : undefined;
  const isSingleControl =
    isValidElement(children) &&
    ((typeof children.type === "string" &&
      ["input", "select", "textarea"].includes(children.type)) ||
      children.type === TextInput ||
      children.type === PasswordInput ||
      children.type === SelectInput ||
      children.type === TextArea);

  let controlId = fieldId;
  let control: ReactNode;
  if (isSingleControl && isValidElement(children)) {
    const element = children as ReactElement<Record<string, unknown>>;
    const existingId = element.props.id;
    controlId = typeof existingId === "string" ? existingId : fieldId;
    const existingDescription = element.props["aria-describedby"];
    control = cloneElement(element, {
      id: controlId,
      "aria-describedby": [
        typeof existingDescription === "string" ? existingDescription : "",
        describedBy || "",
      ].filter(Boolean).join(" ") || undefined,
      "aria-invalid": error ? true : element.props["aria-invalid"],
    });
  } else {
    control = (
      <div className="field-control-group" role="group" aria-labelledby={labelId} aria-describedby={describedBy}>
        {children}
      </div>
    );
  }

  return (
    <div className="field">
      {isSingleControl ? (
        <label className="field-label" id={labelId} htmlFor={controlId}>{label}</label>
      ) : (
        <span className="field-label" id={labelId}>{label}</span>
      )}
      {control}
      {error ? <span id={helpId} className="field-error" role="alert">{error}</span> : hint ? <span id={helpId} className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`text-input ${props.className ?? ""}`} />;
}
export function SelectInput(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`text-input ${props.className ?? ""}`} />;
}
export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`text-input text-area ${props.className ?? ""}`} />;
}
