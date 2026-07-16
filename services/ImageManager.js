export async function generateImage(prompt) {
  // En el futuro, esta función puede decidir qué proveedor usar (Pollinations, OpenAI, etc)
  const safePrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1000000);
  const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?seed=${seed}&nologo=true`;
  
  return {
    url: imageUrl,
    provider: 'Pollinations AI'
  };
}

export default { generateImage };
