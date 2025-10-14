import React, { useState } from "react"

type CollapseProps = {
  children: React.ReactNode
  collapsedByDefault?: boolean
  className?: string
}

export const Collapse: React.FC<CollapseProps> = ({
  children,
  collapsedByDefault = true,
  className
}) => {
  const [collapsed, setCollapsed] = useState(collapsedByDefault)

  return (
    <div className={className}>
      <button
        className="text-[9px] text-yellow-200 font-mono mb-1 px-1 py-0.5 rounded hover:bg-gray-700/20"
        onClick={() => setCollapsed((c) => !c)}>
        {collapsed ? "▶ Show code" : "▼ Hide code"}
      </button>
      {!collapsed && (
        <div className="overflow-x-auto whitespace-pre-wrap">{children}</div>
      )}
    </div>
  )
}
